# RULES.md — 项目结构与修改指南

本文给出 WebReader 的代码地图与逐层修改要点。**流程性约定（分支 / 验证命令 /
版本号 / 手动合并）以 `AGENTS.md` 为唯一入口**，本文不重复。

**最高准则是 `AGENTS.md` §0《核心工程原则》**：本文任何条目与之冲突，一律以 §0 为准。

---

## 项目概述

WebReader：浏览器网页朗读扩展（Chrome MV3）。四层结构 + 一个可选后端。

一句话架构：**纯逻辑全部下沉 `shared/`，content 与 popup 只保留各自的环境胶水层
（state / DOM / 事件），background 只做 provider 路由、消息代理与凭据管理。**

**模型边界（原则 3）**：协议模型（`shared/types.ts` 的消息联合 + `tts-relay` 的 `/v1/*`
HTTP 契约）、领域模型（句子切分 / 正文采集 / 语言检测 / 音色目录 / TTS 重试分类）、
持久化模型（`shared/settings.ts` + storage 键 + `chrome.storage`）、视图模型
（`popup` / `content` 各自的 `state.ts` + `ui.ts`）四类**不得互相泄漏**；
完整映射表与边界守则见 `AGENTS.md` §0.2，本文各层「修改要点」即按此边界展开。

## 开发环境

- Node ≥ 18，npm（无平台专属依赖）；
- 全新 clone 后：`npm install && npm run build`；
- **每次修改代码后必须执行**：

```bash
npm run typecheck   # tsc --noEmit（strict 全项）—— 必须
npm run build       # esbuild 三入口 + 复制 public/ —— 必须
# 或一键：npm run verify = typecheck + build
```

界面层（popup / content）无自动化测试，改动后**必须在浏览器加载 `dist/` 做手动回归**
（清单见 `AGENTS.md` §3）；`test/` 下的 jsdom 冒烟测试用 node 手动运行，
`npm run verify:relay` 覆盖后端中转的 typecheck / build / 单测。

## 分层依赖关系

```
src/shared（跨层共享，零层内依赖；被三入口共同引用）
    ▲            ▲            ▲
    │            │            │
src/background   src/popup     src/content
（路由+provider+凭据）（主界面）  （悬浮窗+正文采集+逐句高亮）
    │            │            │
    └────────────┴────────────┘
                 │
              public/（manifest.json 引用三入口产物）
                 │
              tts-relay/（可选自部署后端，独立 npm 项目，HTTP 短连接对接）
```

**铁律**：

- `shared/**` **不得** import 任何 `background` / `popup` / `content` 模块（否则循环）；
  也不得持有任何层的 state —— 只能是纯函数 / 纯类型 / 纯类。
- `background` 不得 import `popup` / `content`（反之亦然）—— 两者是平行的运行环境。
- `content` 与 `popup` 之间**不得互相 import**；需要同一份逻辑就下沉到 `shared/`。
- 扩展端与 `tts-relay` 之间**只有 HTTP 短连接**（`POST /v1/tts` / `GET /v1/voices` /
  `GET /v1/health`）；WebSocket 私有协议与令牌漂移全部收在后端，扩展端不得引入 WS 客户端。
- **单文件 ≤ 500 行**（原则 2）：历史超限文件已全部拆分完成（见 `docs/tech-debt.md`，
  当前全仓库 130 个 `ts` / `css` 源文件均 ≤ 500 行）；本层新增模块先规划单一职责，
  接近 400 行主动拆分，不要在接近上限的文件上继续堆叠功能。

---

## 各层职责与修改要点

### 1. `src/shared/`（跨层共享）

- `types.ts` — 全部消息 / 音色 / 设置 / 响应类型与 `BackgroundRequest` /
  `BackgroundResponse` 联合、`TtsProvider` / `PresetVoice` / `ExtensionSettings`。
  **契约面**，改动即冻结点（`AGENTS.md` §1.2）。
- `constants.ts` — MiMo 端点 / 模型 / 预置音色表（`MIMO_PRESET_VOICES`）、
  `TTS_PROVIDERS`、relay 存储键与超时（`RELAY_TTS_TIMEOUT_MS`）、音色缓存键、括号对表。
- `messaging.ts` — `sendToBackground` 泛型封装（返回 `Promise<T>`）；三入口统一消息出口。
- `tts.ts` — `synthesizeSpeech`：经 background 代理 MiMo，`base64ToBlob` 解音频；
  含错误分类（`isRetryableTtsError`：只重试超时 / 网络 / 429 / 5xx，401 / 400 立即失败）。
- `tts-pool.ts` — 合成调用层：有限重试 + 全局并发上限与最小启动间隔；预取
  （`AudioCacheManager`）与按需（`ensure`）两条路径共用。
- `sentence-player.ts` — `SentencePlayer`：句子切分（日期 / 小数 / 缩写保护、
  段落结构保留、长句拆分）、段落分隔、object URL 清理。**纯算法**，不依赖 DOM。
- `audio-cache.ts` — `AudioCacheManager`：生产者-消费者预取缓存（`start` / `ensure`
  / `setCurrentIndex` / `stop` / `clear`）；**缓存键含 provider**，两链路互不污染。
- `detect-language/` — 加权分数语言检测（`index.ts` 的 `detectLanguage` 编排与平局规则 +
  `script-fallback.ts` 短文本字符脚本回退 + `scoring.ts` 与 4 个词表）；**纯函数**，
  既有输出已由 `test/detect-language.behavior.mjs` 快照锁定，不得借重构「修正」。
- `language-names/` — 语言 / 国家 / 性别名翻译常量表（`index.ts` 聚合 5 个公共导出 +
  按语言的常量文件；供 i18n 显示用）。
- `settings.ts` — 设置存储层：`persistSettings` / `readSettings`、provider 读写
  （单一事实源）、开关键派生（chrome.storage 不可用时回退 localStorage）。
- `toggle-settings.ts` — 布尔开关统一声明表（`TOGGLE_SETTINGS`）：两层 UI 自动渲染、
  持久化键自动注册、`dependsOn` 从属联动、缺失按默认值兜底。**新增开关只改这一处**，
  另需在 `content/state.ts` / `popup/state.ts` 加同名布尔字段与各层业务读取点。
- `utils.ts` — `applyParentheticalFilter(text, enabled)`（括号过滤，开关由调用层传入）、`sleep`。
- `parentheticals.ts` — `stripParentheticals`：栈式嵌套括号匹配删除（**只处理圆/方/花括号
  及全角形式，不处理 `《》「」『』<>`**）。
- `blob.ts` — `base64ToBlob`（兼容 data: 前缀与 MIME 探测）。
- `audio-format.ts` — base64 解码与音频格式魔数探测（MP3 / WAV / Ogg / FLAC / MP4）。
- `local-tts.ts` — `speechSynthesis` 本地音色容灾：`normalizeLang`（BCP-47 归一化兜底
  `en-US`）、`speak`（多终态只回调一次 `onEnd`）、`canSpeak` / `pause` / `resume` / `cancel`。
- `log.ts` — `Logger` 五级日志（DEBUG/INFO/WARN/ERROR/SILENT）、前缀区分模块、
  浏览器彩色输出 / SW 纯文本降级、`setGlobalLevel` 动态调级；三层各用独立前缀实例化。

**修改要点**：

- shared 被**三入口共同引用**，任何改动都要 `npm run verify` 全量确认；
- 纯逻辑优先在这里覆盖（可写离线单测放 `test/`，用 node 直跑，不引测试框架依赖）；
- 不要让 shared 的函数签名依赖某层的 state 形状 —— 需要状态就改为参数传入
  （`applyParentheticalFilter(text, enabled)` 即为此模式）；
- 修改 `types.ts` 的消息结构必须同步 `background/index.ts` 路由与所有调用点；
- 语速→发音参数的映射是 **provider 特有逻辑，不能下沉到 shared**：MiMo 的风格指令留在
  `background/tts.ts`，Edge 的百分比映射留在 `tts-relay` 的 SSML 层。

### 2. `src/background/`（Service Worker）

- `index.ts` — 消息路由（`chrome.runtime.onMessage` → 分发到 tts / provider / api-key /
  relay / i18n）。
- `provider.ts` — provider 解析与切换（`resolveProvider`）；读写一律走 `shared/settings`，
  保证 background / content / popup 共用同一份。
- `tts.ts` — MiMo TTS 代理：调 OpenAI 兼容 `chat/completions`、语速→风格指令、
  音频格式探测、超时控制（`MIMO_TTS_TIMEOUT_MS`）、错误归一化。
- `relay-tts.ts` — 后端中转客户端：fetch 用户后端 → 原始音频字节 → base64 data URL，
  输出与 MiMo 同形状的 `TtsResponse`，下游管线零改动。
- `relay-config.ts` — relay 地址 / Token 的存取、脱敏、连通性自检（`/v1/health`）；
  保存时按 origin 运行时申请主机权限（`optional_host_permissions`）。
- `api-key.ts` — MiMo API Key 读取 / 保存（`chrome.storage.local`，键 `mimo_api_key`）。
- `context-menu.ts` — 右键菜单「朗读选中文字」的创建与点击路由（浏览器内部页排除）。
- `msg.ts` — `sendToTab`：background → content 消息下发，含「接收端不存在」静默兜底。
- `i18n.ts` — `_locales/<lang>/messages.json` 加载。
- `log.ts` — 本层 logger 实例（前缀 `WebReader/background`）。

**修改要点**：

- **MV3 Service Worker 会被休眠**：不要放长任务 / 长连接；TTS 保持一次性请求-响应；
- 只用 `chrome.*` 与 Web API，**禁止 Node 专属模块**（`fs` / `path` / `http` …）；
- background 不持有可变全局状态（休眠后丢失）；需要持久化就写 `chrome.storage`；
- 错误响应结构（`{ success: false, error, status?, code? }`）是前端依赖的契约，改动需同步
  `shared/types.ts` 与调用点；新增 provider 时错误码要对齐 `isRetryableTtsError` 的分类。

### 3. `src/popup/`（主界面）

- `index.ts` — 入口：DOM 绑定、事件注册、初始化序列（API Key 状态 / 设置 / 音色加载）。
- `state.ts` — popup 可变状态 + DOM 引用（`PopupState` 接口）。
- `ui.ts` — 界面更新（按钮状态 / 提示 / 播放中禁用开关）。
- `voices.ts` — 音色加载 / 过滤 / 搜索 / 下拉 / 选择（目录随 provider 切换）。
- `settings.ts` — `saveSettings` / `loadStoredSettings`（调 shared 存储层 + 同步本层 DOM）。
- `config-ui.ts` — 统一配置面板：「配置 / 切换」入口 + 引擎分段切换（MiMo / 后端中转）
  + 各引擎配置表单 + 后端连通性自检。
- `api-key-ui.ts` — MiMo API Key 配置界面（config-ui 内的 MiMo 表单）。
- `quick-actions.ts` — 「阅读整页 / 从剪贴板粘贴」快捷操作，经 background 转发到当前标签页
  （剪贴板在 popup 内读，借用户手势的 transient activation）。
- `i18n.ts` — 界面语言与国旗图标。
- `utils.ts` — 极薄转发层（`applyParentheticalFilter` 从本层 state 读开关；`sleep` 重导出）。
- `log.ts` — 本层 logger 实例。

**修改要点**：

- popup 运行在扩展弹窗，**没有 Shadow DOM**，DOM 引用直接 `document.getElementById`；
- `state` 的 DOM 引用在初始化后非空，类型上是 `HTMLElement | null`，访问用 `!` 或判空；
- 布局 / 文案 / 按钮状态改动必须浏览器实测（无自动化测试）；
- 新增开关走 `shared/toggle-settings.ts` 声明表 + 本层 `state.ts` 加字段，不要手改界面模板；
- 新功能文案写死中文，不加 `_locales` 键。

### 4. `src/content/`（网页悬浮窗 + 页面内交互）

- `index.ts` — `initWidget`：只做初始化编排（顺序为隐性契约：挂载 → 填充 state →
  绑定 → 加载）与模块级注册；初始化步骤拆到 `widget-init/`（dom-refs / auth-screen /
  audio-player / theme / global-bridge / voice-search / language-select / controls），
  background 消息监听在 `background-messages.ts`，网页点击跳转与划词监听在
  `page-listeners.ts`。
- `state.ts` — content 可变状态 + Shadow DOM 内的 DOM 引用（`ContentState` 接口，
  运行时由 `initWidget` 填充）；`localFallbackActive` 会话级容灾标志也在此。
- `widget/` — 悬浮窗创建：`index.ts`（createWidget 幂等创建 + Shadow DOM 挂载 +
  `getWidget()` / `getWidgetElementById()` + `setWidgetInitializer` 钩子注册点）/
  `icons.ts`（SVG 图标精灵）/ `template.ts`（HTML 结构模板，i18n 插值）/
  `styles*.ts`（CSS：base / panel / controls / theme 四段 + `styles.ts` 顺序聚合器，
  **拼接顺序即级联顺序，不得随意调换段落顺序**）。
- `ui/` — 按钮状态 / 禁用提示 / 拖拽 / 高亮 / 主题（screens / drag / time-progress /
  text-highlight / controls / tooltips，`index.ts` 再导出 23 个公共符号）。
- `player/` — 播放控制：`playback`（开始播放三态判定；autoDetect 开启时调
  `voices/voice-selection.resolveVoiceForText` 落实音色单一来源）/ `chunk`（MiMo 路径 Web Audio
  与本地容灾 speechSynthesis 双分支的单句循环）/ `navigation`（上一句 / 下一句 /
  跳转，防抖 + 请求作废；跳转直接复用 `state.selectedVoice`，不重复检测）/ `entire-page`（整页收集与句子映射生命周期）/
  `stop-clear` / `paste`（粘贴并朗读 + Google Docs 引导）/ `scroll`。
- `voices/` — 音色加载 / 过滤 / 搜索 / 下拉 / 选择（`loader` 缓存与拉取 + `dropdown`
  过滤 / 渲染 / 选择 + `format` 显示格式化纯函数 + `voice-selection` 自动检测
  选音色；悬浮窗内，目录随 provider 切换）。
  - **不变式：`state.selectedVoice` 是「当前要使用的音色」的单一来源**，音色列表
    加载完成且有正文后不为 null。`autoDetectLanguage` 只决定它由检测产生还是
    用户手选：开启时由 `voice-selection.resolveVoiceForText` 在「开始播放 /
    开关开启 / 加载完成且有正文」时检测并**写入** `selectedVoice`（含「检测为空
    脚本回退」与「无匹配音色回退 mimo_default」两道兜底）；关闭时是用户手选值。
    `navigation.jumpToSentence` 与下拉选中态 / 语言过滤一律只读 `selectedVoice`，
    不得重新检测——跳转重新检测曾导致整页朗读点击跳转失效。清除按钮 = 回到
    自动检测（避免「selectedVoice 为空且自动检测关闭」的不自洽态）。
- `selection.ts` — 划词后的绿色朗读按钮（Shadow DOM 注入样式，跟随左键抬起位置）。
- `text-input.ts` — 选中朗读 / 粘贴预处理（去 HTML 标签 / 方括号）。
- `page-fab.ts` — 页面内「朗读整页」悬浮按钮：可拖动 + 3 秒无点击自动吸附边缘，
  Shadow DOM 隔离，有可采集正文时才出现。
- `extractor/` — 网页正文采集（selectors / site-rules / skip-patterns / pattern-match /
  block-detection / addressable-text / traversal + `index.ts` 编排与再导出）；块级遍历
  + 文本过滤，**只读不修改页面**；`collectPageUnits` 输出文档序、非重叠的段落单元
  （元素 + 与 DOM 逐字对齐的「可寻址文本」）。
- `sentence-map.ts` — 句子 → 段落单元 → **精确字符区间**映射（区间式分割，剔括号后可多段）；
  供逐句高亮与「点击跳转」反查。
- `reading-overlay.ts` — 网页内逐句高亮的 DOM 覆盖层：把句子区间对应的文本节点包进透明
  `span.tts-reading-sentence`，播放时加高亮类；**绝不覆盖 / 替换原文**；含悬停预览与
  点击跳转（`resolveClickJumpTarget` 纯函数放行链接 / 修饰键 / 拖选）。
- `reading-styles.ts` — 高亮样式注入：可构造样式表（`CSSStyleSheet` + `adoptedStyleSheets`）
  优先、`<style>` 回退，调用幂等。
- `web-audio-player.ts` — Web Audio 播放器（绕页面 CSP 对 blob 媒体的拦截）。
- `settings.ts` — 悬浮窗设置（调 shared 存储层 + 同步 Shadow DOM 内控件）。
- `toggle-settings.ts` — 悬浮窗开关 checkbox 的数据驱动渲染与事件绑定（来自 shared 声明表）；
  额外副作用（如高亮主开关触发覆盖层重建）集中在 `TOGGLE_CHANGE_HANDLERS`。
- `i18n.ts` — 界面语言与国旗（`language-names` 表）。
- `utils.ts` — 极薄转发层（同 popup）。
- `log.ts` — 本层 logger 实例（按模块细化前缀）。

**修改要点**：

- **悬浮窗可能尚未创建**：`getWidget()` 返回 `HTMLElement | null`，所有调用必须判空或可选链；
- `widget/` 的 `index.ts` **不得 import `index.ts`**（循环依赖）：初始化一律走
  `setWidgetInitializer` 钩子；
- Shadow DOM 内的 DOM 引用全部用 `getWidgetElementById` / `getWidget().querySelector`，
  **不要**用 `document.getElementById`（会拿到页面的，不是悬浮窗的）；
- 页面 CSP 可能拦截 blob 媒体 → MiMo 路径音频走 `WebAudioPlayer`，不要回退 `<audio src=blob:>`；
  本地容灾路径无播放句柄，暂停 / 恢复走 `speechSynthesis`；
- 逐句高亮的 DOM 回指依赖「文本框内容 === 句子表拼接」的自检；不成立时自动降级为仅悬浮窗高亮，
  不要绕过自检强行走 DOM 回指；
- 正文采集（`extractor`）是**只读**的：不得注入或修改页面 DOM，包裹 span 只能发生在
  `reading-overlay` 的文本节点层面。

### 5. `public/`（静态资源，原样复制到 `dist/`）

- `manifest.json` — MV3 清单（**版本号与 `package.json` 同步**；入口文件名是契约；
  `optional_host_permissions` 用于后端中转按 origin 运行时申请）。
- `popup.html` + 7 个 `popup-*.css`（base / header / panels / buttons / config-panel /
  voice-panel / status）— 主界面结构与样式，由 `popup.html` 顺序 `<link>` 引用；
  **`<link>` 顺序即层叠顺序**，调整分区顺序会改变覆盖关系。
- `_locales/<lang>/messages.json` — **2 个语言文件（en / zh_CN），不要动**（i18n 键保持既有集合）。
- `icons/` — 扩展图标。

**修改要点**：

- manifest 改动必须 `npm run build` 后在 `chrome://extensions` 真实加载确认
  （`permissions` / `host_permissions` / `optional_host_permissions` /
  `content_scripts.matches` 错误只在加载时报）；
- 资源文件名只用小写 + 连字符 / 下划线，不含空格与中文。

### 6. `tts-relay/`（可选后端中转，独立 npm 项目）

部署与协议事实见 `tts-relay/README.md`（Edge 引擎端点、`Sec-MS-GEC` 令牌算法、
错误码映射表）。扩展端只通过 `background/relay-tts.ts` 与之 HTTP 短连接交互。

**修改要点**：

- 与扩展是**两个独立 npm 项目**：扩展改动跑 `npm run verify`，后端改动跑
  `npm run verify:relay`，一键全量用 `npm run verify:all`；
- 后端的端点 / 令牌常量变更**不需要扩展发版**（这正是中转架构的价值）；
- 错误码映射改动必须同步 `shared/tts.ts` 的 `isRetryableTtsError` 与 `background/relay-tts.ts`。

---

## 构建配置

- `esbuild.config.mjs` — 三入口 IIFE 打包（content / popup / background）+ 复制 `public/`；
  产物在 `dist/`，可直接作为"已解包的扩展程序"加载。
- `tsconfig.json` — **strict 全项**（`noImplicitAny` / `strictNullChecks` /
  `useUnknownInCatchVariables` / `noUnusedLocals` / `noUnusedParameters`），
  `npm run typecheck` 必须 0 错误。
- `.prettierrc` — 2 空格 / 单引号 / 分号 / 行宽 140 / 尾逗号 es5 / LF。

---

## 跨平台硬约束（摘要）

完整清单见 `AGENTS.md` §6，改任何代码 / 脚本 / 文档示例前自查：

- 源码统一 LF、UTF-8 无 BOM；读外部文件注意 strip `\r`；
- import 路径大小写与磁盘完全一致（Linux 大小写敏感）；
- `package.json` scripts 一律 `node` / `tsc` / `prettier` 形式，不写 `rm -rf` / `&&` 链 /
  `$(...)` 等 POSIX 专属写法；构建脚本内路径用 `node:path`；
- 扩展代码（background / content / popup）**只用 `chrome.*` 与 Web API**，
  禁止任何 Node 专属模块；
- 不硬编码绝对路径；资源路径走 `chrome.runtime.getURL()`。

**原则硬约束（摘要，详见 `AGENTS.md` §0 / §6）**：

- 单文件 ≤ 500 行（原则 2），超限文件清单与拆分方向见 `docs/tech-debt.md`；
- 四类模型不互相泄漏，`shared/**` 不持层 state、不 import 层模块（原则 3）；
- 新增依赖前先核查已有依赖 + 官方文档 + 类型定义（原则 7）；
- 日志保留诊断上下文，禁止输出 API Key / 中转 Token（原则 9）；
- 内部路径重构直接删除过时实现并同步调用方，兼容只在 `AGENTS.md` §1.2 标注【对外】的契约上保留（原则 10）。
