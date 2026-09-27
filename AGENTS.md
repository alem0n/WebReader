# AGENTS.md — WebReader 上下文与开发规则

本文件是 AI 代理与人类开发者在本仓库工作的**唯一入口约定**：先读这里，再动手。
配合 `README.md`（怎么用 / 功能事实）、`RULES.md`（代码地图与逐层修改要点）、
`DESIGN.md`（界面视觉基准）使用。

**优先级顺序（高 → 低，冲突时高位为准）**：

1. **§0 核心工程原则** —— 全局最高原则，任何设计、代码、文档与之冲突一律以 §0 为准；
2. 本文件其余各节（§1–§7）—— 项目特化的架构契约、验证要求与 Git 工作流；
3. `RULES.md` / `README.md` / `DESIGN.md` / `tts-relay/README.md` —— 代码地图与事实基准；
4. `docs/adr/`（架构决策记录）与 `docs/tech-debt.md`（技术债务登记表）——
   原则八要求的长期协作媒介。

> **总则：类型安全 + 产物可加载。** 本项目是 Chrome MV3 扩展，`tsc --noEmit` 0 错误
> （strict 全项开启）与 `npm run build` 产出可加载的 `dist/` 是**每次改动的最低门槛**，
> 详见 §2、§3。

---

## 0. 核心工程原则（最高原则）

> 以下原则是本仓库的**最高工程准则**，优先级高于本文件其余各节及所有其他文档。
> 编号沿用来源（缺第 4 / 5 项），引用时写「原则 N」。

### 0.1 原则正文

1. **架构与领域优先**：计划阶段应以理想架构为目标，明确业务目标、领域边界、模块职责、
   依赖方向和数据流，形成符合领域规律、面向长期维护且可持续演进的设计后再进入编码；
   不得以短期实现便利牺牲整体设计。设计必须完整，实现应当克制：不做推测性抽象，
   抽象延迟到第二个真实用例出现时才引入，单一场合直接实现。
2. **追求优雅的代码模块**：模块应高内聚、低耦合，通过精简且稳定的接口封装内部复杂度，
   使职责、命名、依赖和扩展方式清晰自然；代码按单一职责拆分，**单个文件不得超过 500 行**，
   接近上限时应优先重构模块边界。
3. **保持边界与数据流清晰**：协议模型、领域模型、持久化模型和视图模型不得相互泄漏；
   数据必须在边界处完成校验和独立转换，避免跨层共享可变状态。
6. **保障完整前端体验**：前端应控制渲染成本、异步状态和并发请求，保持清晰的 UI 结构；
   用户流程必须覆盖加载、空状态、错误、重试、反馈和可访问性。
7. **复用稳定的业务语义**：优先复用已有模块和能力，但不要仅因代码外形相似而过早抽象；
   确需重复时，必须注释说明其独立演进或暂不抽象的原因。新增依赖前先核查项目已有依赖
   （根 `package.json` 与 `packages/` workspace）能否满足需求，不得臆断已有库缺少功能——
   先查阅文档和类型定义；确需引入时优先成熟且维护良好的库，不重复实现通用功能。
8. **为未来维护者保留上下文**：代码、注释、测试和架构文档是跨越时间的协作媒介。
   非显然的设计决策、兼容约束、已知缺陷和临时方案，必须记录原因、影响范围、潜在风险
   及移除条件；技术债务应关联可追踪任务，关键架构决策应同步到 ADR，禁止留下缺少上下文的 TODO。
9. **确保变更可验证、可观测、可回滚**：每项改动都应行为可测试、运行状态可观测、故障可定位，
   并兼顾向后兼容和回滚路径；错误与日志必须保留诊断上下文，但不得泄露敏感信息。
10. **删除优于兼容**：内部路径重构时直接删除过时实现，禁止新增兼容层、deprecated shim
    或双写逻辑；对外契约（`/api/*` 等稳定接口、数据库迁移）的兼容性按协议契约单独评估，
    属于合同义务而非迁就旧代码。

### 0.2 原则在本项目中的落地

| 原则 | 本项目执行方式 | 详见 |
| --- | --- | --- |
| 1 架构与领域优先 | 动手前先核对 §1.1 设计决策与 `RULES.md` 的分层依赖方向（纯逻辑下沉 `shared/`，两层只留环境胶水）；不得为图快绕过分层铁律 | §1.1 / `RULES.md` |
| 2 优雅模块 + 500 行上限 | 单文件 > 500 行为硬约束（含 `public/popup-*.css` 等纯资源文件）；接近 400 行主动规划拆分。历史超限文件已全部拆分完成，见 `docs/tech-debt.md` | §6 / `docs/tech-debt.md` |
| 3 模型边界不泄漏 | 四类模型到本项目的映射见下表；`shared/**` 只能是纯函数 / 纯类型 / 纯类，不持任何层 state | §0.2 / `RULES.md` |
| 6 完整前端体验 | 浏览器手动回归清单必须覆盖加载 / 空状态 / 错误 / 重试 / 反馈 / 可访问性，不只是「 happy path 」 | §3 |
| 7 复用 + 依赖核查 | 本仓库无 `packages/` workspace；新增依赖前先核查根 `package.json`（零运行时依赖、5 个 devDependency）与 `tts-relay/package.json` 能否满足，先查文档与类型定义再决定引入 | §3 / §6 |
| 8 上下文 + ADR + 债务 | 关键架构决策同步 `docs/adr/`；已知缺陷与临时方案登记 `docs/tech-debt.md`（含原因 / 影响 / 风险 / 移除条件）；TODO 必须带上下文 | §5 / §7 |
| 9 可验证可观测可回滚 | 每次改动跑 §3 的验证命令；`shared/log.ts` 五级日志保留诊断上下文，但**禁止输出 API Key / 中转 Token 等凭据** | §3 / §6 |
| 10 删除优于兼容 | §1.2 标注【对外】的契约按合同义务保持兼容（含迁移与回滚路径）；其余内部实现重构时**直接删除并同步调用方**，禁止兼容层 / shim / 双写 | §1.2 |

**四类模型映射（原则 3）**：

| 模型 | 本项目位置 | 边界守则 |
| --- | --- | --- |
| 协议模型 | `shared/types.ts`（background 消息联合）+ `tts-relay` 的 `/v1/*` HTTP 契约 | 只描述跨边界协议，不含层内状态；改动即 §1.2 冻结点 |
| 领域模型 | 句子切分 / 段落单元 / 默认音色派生 / 音色目录 / TTS 重试分类（`sentence-player` / `extractor` / `sentence-map` / `voice-default` / `tts.ts` 等） | 纯逻辑，不依赖 DOM 与层 state；需要状态就改为参数传入 |
| 持久化模型 | `shared/settings.ts` + storage 键（`constants.ts`）+ `chrome.storage` 读写 | 键名是面向老用户数据的对外契约；视图层不得绕过存储层直写 storage |
| 视图模型 | `popup/state.ts` / `content/state.ts`（各含 DOM 引用）+ 各层 `ui.ts` | 两层视图模型互不 import，形状不得泄漏进 `shared` |

---

## 1. 这个仓库是什么

**WebReader**：浏览器网页朗读扩展（Chrome MV3）。把网页正文、选中文字或粘贴的文本
转成语音朗读。四层结构 + 一个可选后端：

```
src/
  shared/       ★ 跨层共享：类型 / 常量 / 消息封装 / TTS / 合成重试与并发 /
                 句子播放 / 音频缓存 / 默认音色派生 / 本地音色容灾 / 开关声明表 /
                 工具 / 日志 —— content 与 popup 共用同一份
  background/   ★ Service Worker：provider 路由 + MiMo 代理 + 后端中转客户端 +
                 API Key / 中转配置管理 + 右键菜单 + i18n 语言文件
  popup/        ★ 主界面（扩展弹窗）：状态 / 界面 / 音色 / 设置 / 统一配置面板 / 快捷操作
  content/      ★ 网页悬浮窗（Shadow DOM 隔离）：创建挂载 / 状态 / 界面 / 播放 /
                 正文采集 / 句子映射 / 网页内逐句高亮 / 选中朗读 / 悬浮按钮 /
                 Web Audio 播放器
tts-relay/      ★ 后端中转服务（Edge TTS，独立 npm 项目，可选自部署）
test/           ★ jsdom 冒烟测试（node 手动运行）
public/         静态资源（原样复制到 dist/）：manifest.json / popup.html +
                7 个 popup-*.css（base / header / panels / buttons / config-panel /
                voice-panel / status，<link> 顺序即层叠顺序）/
                _locales（en / zh_CN）/ icons
esbuild.config.mjs  三入口构建（content / popup / background）+ public 复制
```

**语音链路（三条，可切换）**：

- **MiMo TTS**（默认）：`mimo-v2.5-tts`，OpenAI 兼容协议，API Key 在主界面配置
- **后端中转**（可选，provider `relay`）：填自部署的 `tts-relay` 地址即改用 Edge 语音；
  WebSocket 私有协议与令牌漂移全部吸收在后端，扩展端始终是纯 HTTP 短连接
- **本地音色容灾**：未配置 Key 或合成失败时自动切 `speechSynthesis`，停止 / 重播后回到 MiMo

**无登录体系**，不请求任何自建服务器（MiMo / 中转后端均由用户自行配置）。

### 1.1 关键设计决策（改动前必须理解）

| 决策 | 原因 |
| --- | --- |
| 纯逻辑模块统一抽到 `shared/` | content 与 popup 运行环境不同但业务逻辑相同，共用一份实现避免重复与漂移 |
| `state` / `ui` / `player` / `voices` / `i18n` 不合并 | 两层运行环境完全不同（网页 Shadow DOM vs 扩展弹窗），DOM 结构与状态生命周期不可共享；只把**无状态纯逻辑**下沉，有状态层各自保留 |
| `widget ↔ index` 用钩子注册而非直接 import | createWidget 创建挂载后需要 initWidget 绑定事件，而 initWidget 又要拿 widget 内的 DOM —— 直接互引是循环依赖。改为 index 通过 `setWidgetInitializer` 注册钩子，widget 不反向依赖 index |
| provider 路由对下游透明 | `ttsSpeech` / `getPresetVoices` 消息体与 `TtsResponse` 契约**不随 provider 变化**（provider 由 background 从存储读取路由）；音色提供由各引擎的 VoiceProvider 独立实现（`background/voices/`，ADR 0003），消息处理器只做派发，新增引擎不改消息与界面；音频缓存键含 provider（`${index}-${provider}-${voice}-${speed}`）使两链路互不污染；下游 `base64ToBlob` / `audio-cache` / `sentence-player` / `web-audio-player` 零改动 |
| 新增开关只改 `shared/toggle-settings.ts` 声明表 | 数据驱动两层 UI 自动渲染 + 持久化键派生 + `dependsOn` 从属联动，避免 popup / 悬浮窗两处模板不同步 |
| 默认音色按界面语言派生，取消正文语言自动检测 | 检测收益低（MiMo 仅中英语色）且误判体感差；界面语言只有中 / 英两档，直接映射音色语言前缀即可。`selectedVoice` 保持单一来源，`voiceSelectionIsManual` 区分手选（持久化）与派生（跟随界面语言）。见 [ADR 0002](docs/adr/0002-voice-default-from-interface-language.md) |
| 网页内逐句高亮**不覆盖原文** | 只把正在朗读的句子对应的文本节点包进透明 span 加高亮类，原文内容 / 结构 / 样式完全不变 |
| 新功能文案**写死中文**，不新增 i18n 键 | 避免 i18n 键膨胀；`_locales` 键保持既有集合不变。仅界面语言切换（`interfaceLanguage`）走既有 i18n 键 |
| 括号匹配**不处理**书名号 `《》`、引号 `「」『』`、尖括号 `<>` | 避免误删书名与数学/代码符号（`stripParentheticals` 只处理圆/方/花括号及全角形式） |
| 开关状态持久化到 `chrome.storage.local`，播放/加载期间禁用开关 | 防止中途变更导致状态不一致 |
| TTS 统一经 `background` 代理 | content 不能直接请求外部 API（页面 CSP / 跨域），统一走 `sendToBackground` 消息；data URL 由 shared 的 `base64ToBlob` 解析 |
| manifest 权限用 `optional_host_permissions` | 安装期不声明 `<all_urls>`；保存后端中转地址时按 origin **运行时申请**主机权限，用户可随时收回 |
| Web Audio API 播放音频 | 绕过页面 CSP 对 blob 媒体的拦截（`WebAudioPlayer`） |
| 严格类型 strict 全项 + prettier | `noImplicitAny` / `strictNullChecks` / `useUnknownInCatchVariables` / `noUnusedLocals` / `noUnusedParameters`，`as any` 只允许用于确实无法收窄的 DOM 操作（如 `e.target`） |
| `getWidget()` 返回 `HTMLElement \| null` | 悬浮窗可能尚未创建，类型必须体现可空；所有调用点据此判空或用可选链 |
| **打包形态（Node SEA）单文件分发** | esbuild 打单文件 CJS + `node --build-sea`；托盘 Go 二进制不能进 JS 包，改由 SEA assets 内嵌、运行时释放到 systray2 缓存目录（`~/.cache/node-systray/<版本>/`）后以 `copyDir:true` 对接；版本号取自 `systray2/package.json` 不硬编码。打包态配置 / 日志取可执行文件同目录（`__dirname` 在 SEA 里是虚拟路径）。单平台构建，跨平台需分别在各平台执行。见 [ADR 0005](docs/adr/0005-tts-relay-single-executable-packaging.md) |
| **界面语言 / 主题统一由主页配置** | 语言与主题是全局配置，悬浮窗只需跟随。主页是全局配置中心（引擎 / 音色 / 语速 / 开关），主题入口本就应在主页；原悬浮窗主题存网页自身 localStorage，与主页互不可见，两套界面会不一致。统一存 `chrome.storage.local`，悬浮窗经 `storage.onChanged` 即时跟随。见 [ADR 0006](docs/adr/0006-global-ui-config-from-popup.md) |
| tts-relay 托盘 UI 层与配置持久化 | 桌面驻留形态：`systray2` 预编译二进制零本机编译（Electron 太重 / nut-js 需 node-gyp）；新增 `runtime/` 层收拢服务生命周期，`tray/` 只调它不直接碰 http；配置三级优先（环境变量显式 > `config.json` > 默认），托盘改动即落盘即生效；启动即后台化（脱离启动终端，关终端不中断，日志转 `tts-relay.log`）；
  托盘不可用时自动回退无头模式。见 [ADR 0004](docs/adr/0004-tts-relay-tray-ui-and-config-persistence.md) |

> 上表是本项目的**决策日志**（原则八）。**新增关键架构决策时，在 `docs/adr/` 补一条 ADR
> 并在本表登记链接**；仅调整既有决策的实现细节则更新本表原因列即可。

### 1.2 契约冻结点（破坏即需同步改调用方）

**契约分级（原则十）**：下列冻结点分为两类——

- 标注【对外】的是**对外契约**（用户已安装实例 / 用户数据 / 跨进程 HTTP 协议 / 平台清单）。
  兼容性是**合同义务**，破坏前必须显式评估迁移与回滚路径（原则九），不得以「内部重构」名义随意破坏；
- 标注【内部】的是**内部实现**，重构时**直接删除过时实现并同步所有调用方**，
  禁止留兼容层 / deprecated shim / 双写逻辑（原则十）。

- **background 消息协议**【内部】：`src/shared/types.ts` 的 `BackgroundRequest` / `BackgroundResponse`
  联合类型与 `action` 枚举（`ttsSpeech` / `getPresetVoices` / `saveApiKey` /
  `saveRelayConfig` / `checkRelayStatus` / `switchProvider` / `readEntirePageOnActiveTab` /
  `playTextOnActiveTab` / `toggleWidgetOnActiveTab` / `loadI18nMessages` …）。改结构必须同步
  `background/index.ts` 路由与所有调用点
- **TTS 配置常量**【内部】：`src/shared/constants.ts` 的 `MIMO_API_URL` / `MIMO_MODEL` /
  `MIMO_PRESET_VOICES` / `VOICE_SUPPORTED_LANGS`、`TTS_PROVIDERS`、
  `RELAY_TTS_TIMEOUT_MS` / `MIMO_TTS_TIMEOUT_MS`
- **storage 键名**【对外，等同数据迁移】：`MIMO_API_KEY_STORAGE`（`mimo_api_key`）、`RELAY_URL_STORAGE`
  （`relay_url`）、`RELAY_TOKEN_STORAGE`（`relay_token`）、`TTS_PROVIDER_STORAGE`
  （`tts_provider`）、`INTERFACE_THEME_STORAGE`（`interfaceTheme`，主页标题栏主题切换写入，
  悬浮窗经存储变更监听跟随）、`LOCAL_STORAGE_SETTINGS_KEY`（`tts-settings`）、音色缓存键
  （`VOICES_CACHE_*`）—— 旧版本用户数据依赖它们
- **错误响应结构**【内部】：`{ success: false, error, status?, code? }` 是扩展内前端依赖的契约，
  `isRetryableTtsError` 依赖其错误分类；**与 `tts-relay` 的错误码映射表是【对外】跨进程契约**，
  双侧改动必须同步发版窗口
- **manifest 契约**【对外】：`public/manifest.json` 引用的入口文件名
  （`content.js` / `popup.js` / `background.js`）与 `_locales` 目录结构；构建产物路径不可漂移
- **功能约定**【对外】：无登录、三条语音链路、预置音色表 —— 面向用户的事实见 `README.md`
- **tts-relay `config.json` 键名**【对外，等同数据迁移】：`RelayConfig` 的 camelCase 字段
  （`port` / `host` / `relayAuthToken` / `edgeEndpoint` / `trustedClientToken` /
  `chromiumVersion` / `outputFormat` / `maxConcurrency` / `maxPerClient` / `maxQueueSize` /
  `voicesTtlMs` / `synthTimeoutMs`）是托盘菜单持久化到二进制所在目录的用户数据；
  改键名必须提供迁移与回滚路径（旧文件读不出会静默回退默认，见 `config/store.ts`）

---

## 2. 环境与命令

要求：Node ≥ 18（esbuild + typescript），npm。无平台专属依赖，Windows / Linux / macOS 均可。

```bash
npm install                # 安装依赖
npm run typecheck          # tsc --noEmit —— 必须，0 错误（strict 全项）
npm run build              # esbuild 三入口 + 复制 public/ 到 dist/，直接作为
#                           # "已解包的扩展程序"加载（chrome://extensions → 开发者模式）
npm run verify             # typecheck + build，交付前一键验证
npm run format             # prettier 写入
npm run format:check       # prettier 只检查（CI 用）
npm run watch              # 监听重建

# 后端中转服务（tts-relay/，独立 npm 项目，可选）
npm run verify:relay           # typecheck + build + 单测（含打包产物端到端）
npm --prefix tts-relay start    # 启动：node tts-relay/dist/index.js（默认 127.0.0.1:8787）
# 打包为单文件可执行（Node SEA，需 Node 25.5+ 才能一步出可执行文件）
npm --prefix tts-relay run pack # → tts-relay/dist-pack/tts-relay[.exe]，可拷到同平台机器双击运行

# 扩展 + 后端一键验证
npm run verify:all
```

`test/` 下的 jsdom 冒烟测试用 node 直接运行（如 `node test/config-panel.smoke.mjs`），
不在 `npm run verify` 内，改动相关模块时手动跑一遍。

加载方式：`chrome://extensions` → 开启开发者模式 → 加载已解包的扩展程序 → 选择 `dist` 目录。

---

## 3. 改动类型 → 必须执行的动作

| 改动 | 必做 | 说明 |
| --- | --- | --- |
| 任意 `src/**` / `tts-relay/src/**` / `public/*.css` / `tts-relay/pack.mjs` | `npm run verify`（后端用 `verify:relay`）+ **行数自检** | 单文件不得超过 500 行（原则 2）；新增文件先规划单一职责，接近 400 行主动拆分；改动已超限文件时把拆分纳入本分支或同步更新 `docs/tech-debt.md` |
| `src/shared/**` | `npm run verify` | shared 被三入口共同引用，任何改动都需全量构建确认不破坏其它入口 |
| `src/background/**` | `npm run verify` | 消息路由 / provider / API 代理改动需核对 §1.2 契约与 `README.md` 功能约定 |
| `src/popup/**` 或 `src/content/**` | `npm run verify` + **浏览器手动回归**（见下）+ 相关 `test/*.smoke.mjs` | 界面层无自动化测试，改动必须人工验证 |
| `tts-relay/**` | `npm run verify:relay`（改动 `pack.mjs` / `packaging/sea.ts` 后额外跑 `npm --prefix tts-relay run pack` 确认可打包，并跑 `node test/sea.e2e.cjs` 验产物） | 独立项目，有自己的 typecheck / build / 单测 |
| `public/manifest.json` | `npm run build` + 手动核对 manifest 字段 | MV3 清单错误只在加载时报错，构建器不校验；`permissions` / `host_permissions` / `optional_host_permissions` / `content_scripts.matches` 变更需重点确认 |
| `esbuild.config.mjs` / `tsconfig.json` | `npm run verify` | 构建配置改动需确认三入口产物大小与 public 复制完整 |
| 文案 / i18n | `npm run build` + 手动看界面 | 新功能文案一律写死中文（§1.1），不要新增 `_locales` 键 |
| 文档（`*.md`） | 至少 `npm run typecheck` | 若文档描述了命令，需实际执行一遍确认命令可用；命令示例必须跨平台可复制（§6） |
| 依赖变更 | **先核查已有依赖能否满足**（根 `package.json` 零运行时依赖 / 5 个 devDependency；`tts-relay/package.json`；原则 7），查文档与类型定义后再 `npm install`；一并提交 `package-lock.json`，commit body 写明核查结论与引入原因 | 不要把 `node_modules/` 带进仓库；MV3 Service Worker / CSP 约束见 §6 |

**浏览器手动回归清单**（popup / content 改动后必跑）：
选中朗读（划词 → 绿色按钮 / 右键菜单）、整页朗读（悬浮窗 + popup 快捷操作 + 页内悬浮按钮）、
音色选择与搜索、provider 切换与后端中转配置自检、默认音色跟随界面语言与手选持久化、语速选择、
「删除括号内容」开关、网页内逐句高亮与点击跳转、本地音色容灾（不填 Key 朗读）、
API Key 配置与保存、悬浮窗拖拽 / 最小化 / 主题切换、粘贴并朗读。

**完整体验回归（原则 6，每条流程都要覆盖，不只走 happy path）**：

- **加载中**：音色列表 / 正文采集 / 自检按钮的加载态与防重复点击；
- **空状态**：采集不到正文（引导「粘贴并朗读」）、音色目录为空、剪贴板为空；
- **错误与重试**：Key 失效 / 网络波动 / 中转自检失败时的可操作文案与重试入口（`isRetryableTtsError` 的分类在界面上要能看出来）；
- **反馈**：保存成功、provider 切换、开关变更的即时反馈；
- **可访问性**：按钮与控件有可读名称、焦点可见、键盘可触发。

> **硬性要求**：任何改动都必须实际运行对应验证。**不允许**在未运行 `npm run verify` 的情况下
> 声称"构建通过"或"类型正确"。界面改动必须在浏览器里真实加载 `dist/` 走一遍回归清单。

---

## 4. Git 工作流（强制：手动合并 + 版本号管理）

### 4.0 铁律

1. **`master` 只接受合并，不接受直接提交。**
2. **每次改动都必须新建分支**，完成后走"验证 → 提请用户手动合并 → 用户合并后在 master 复验 → 删除分支"。
3. 只有**验证完全通过**（§2 / §3 对应命令全绿）才允许提请合并。
4. **合并 `master` 默认由用户手动执行**：AI 不得自行执行 `git checkout master` / `git merge`，
   只能把分支、验证结果、版本升级建议与合并命令准备好，交用户执行。
   **授权例外**：用户在请求合并的语境中明确提到「**授权**」（如「我授权你合并」/「所有流程你都代劳」）时，
   AI 可代为执行**当次**合并的本地流程：`git checkout master` → `git merge --no-ff` →
   合并后 `npm run verify` → 打 tag → 删除已合并分支。授权**仅对当次合并有效**，完成后即失效，
   不构成长期或跨任务授权；且不改变本节第 3 条（验证必须全绿后才能动手）与第 6 条
   （禁止 `git push --force` / `git commit --no-verify` / `git reset --hard` 丢弃他人改动）。
   **推送到远端（`git push`）不在授权范围内**，仍一律由用户手动执行。
5. **每次合并都要按 §4.3 处理版本号**（主版本由用户定义），版本升级随分支提交。
6. 禁止：`git push --force`、`git commit --no-verify`、`git reset --hard` 丢弃他人改动。
7. 禁止提交生成物：`node_modules/`、`dist/`（已在 `.gitignore`）。

### 4.1 标准流程

```bash
# 0) 起点检查：工作区必须干净，且基于最新 master
git status --short                 # 应为空
git checkout master && git pull    # 无远端时跳过 pull
git log --oneline -3               # 确认基线

# 1) 建分支（命名：<type>/<scope>-<简述>）
git checkout -b feat/voice-search-clear
#    type ∈ feat | fix | docs | refactor | style | test | chore
#    scope 建议用层名或模块：shared | background | popup | content | relay | build | docs

# 2) 小步提交（一个提交只做一件事）
git add src/shared/tts.ts
git status --short                 # 复核：只暂存自己改的文件
git commit                         # 见 §4.2 消息规范

# 3) 验证（改动类型对应 §3 的命令，必须真实执行）
npm run verify

# 4) 分支上完成版本升级（§4.3），独立提交
git add package.json public/manifest.json
git commit -m "chore(version): 0.9.0 -> 0.9.1（修复 xxx）"

# 5) 交付前复核：只包含预期改动
git log master..HEAD --oneline     # 提交清单
git diff master --stat             # 改动范围

# 6) 提请合并（默认由用户手动执行；用户明确「授权」时由 AI 代劳，见 §4.0 第 4 条）
#    交付信息：分支名 / 验证结果 / 当前版本 → 目标版本 / 升级依据
#    方式 A —— 用户在 master 上手动执行（保留分支脉络，不使用 fast-forward）：
#      git checkout master
#      git merge --no-ff feat/voice-search-clear -m "merge: 修复 xxx"
#      npm run verify                # 合并后复验
#      git branch -d feat/voice-search-clear
#    方式 B —— 用户回复「授权」后，由 AI 执行与方式 A 完全相同的步骤并逐项核对；
#      唯一差别：不执行 git push（远端推送仍归用户）。
```

### 4.2 Commit 消息规范

格式：`<type>(<scope>): <简述>`，正文用中文分点说明**改了什么、为什么、验证了什么**。

```text
fix(content): 修复悬浮窗未创建时保存设置崩溃

- 问题：saveSettings 直接 getWidget().querySelector，widget 未创建时返回 null 崩溃
- 方案：先取 widget 变量再判空，getWidget 返回类型收紧为 HTMLElement | null
- 验证：npm run verify（tsc 0 错误，三入口构建成功），浏览器加载 dist/ 回归通过

Refs: AGENTS.md §1.1
```

要求：

- 一次提交 = 一个逻辑改动；不要把"改功能 + 改格式 + 升依赖"混在一起。
- 正文必须包含**验证方式与实际结果**；没有验证的提交视为未完成。
- 禁止 emoji、禁止"update code"这类无信息量的描述。

### 4.3 版本号管理

**格式：`主版本.次版本.修复版本`**（三段均为非负整数，当前 `0.9.0`）。
唯一来源是根 `package.json` 的 `version` 字段；与 `public/manifest.json` 的 `version`
保持一致（扩展版本号以 manifest 为准对外，两者必须同步）。

| 触发 | 版本变化 | 说明 |
| --- | --- | --- |
| 新增功能 / 能力 | 次版本 +1，修复版本归 0 | `feat/*` 分支默认按此处理 |
| 修复 bug | 修复版本 +1 | `fix/*` 分支默认按此处理 |
| 文档 / 重构 / 格式 / 依赖等无行为变化 | 修复版本 +1 | 避免版本停滞；用户明确要求时可不动版本 |
| 主版本 | **由用户定义** | AI 不得自行变更；用户要求升主版本时，次版本与修复版本归 0 |

执行要求：

- 合并进 `master` 之前，必须在分支上完成版本升级（根 `package.json` + `public/manifest.json`
  同步），建议独立提交：`chore(version): 0.9.0 -> 0.10.0（新增 xxx 能力）`。
- 提请手动合并时，必须报告"当前版本 → 目标版本"与升级依据。
- 版本号只增不减，禁止回退或复用已用过的版本号。

### 4.4 Tag 与 Release

- tag 名 `v<主>.<次>.<修>`，与 `package.json` / `manifest.json` 的 version 完全一致；
  只打在 `master` 上（合并复验之后），注释 tag 消息格式 `vX.Y.Z —— <一句话摘要>`。
- 打 tag 由**用户手动执行**；用户「授权」AI 代劳合并时可一并由 AI 执行（见 §4.0 第 4 条）。
  `git push` / push tag 一律由**用户手动执行**，AI 只起草 tag 摘要与发布说明。
- 发布说明（若有）写 `.github/release-notes/v<版本>.md`，先于或与 tag 同批入库。

---

## 5. 完成定义（Definition of Done）

- [ ] 改动范围与需求一致，没有顺手改无关文件
- [ ] 没有破坏 §1.2 的契约冻结点（若必须改，调用方同步修改 + `README.md` 更新；【对外】契约另需迁移与回滚路径）
- [ ] 新增 / 修改文件均 ≤ 500 行；超限已拆分或同步登记 `docs/tech-debt.md`（原则 2）
- [ ] 重构内部路径时删除了过时实现，未新增兼容层 / deprecated shim / 双写（原则 10）
- [ ] 代码无缺少上下文的 TODO；临时方案已注明原因与移除条件（原则 8）
- [ ] 日志 / 错误响应保留诊断上下文，且不含 API Key / 中转 Token 等敏感信息（原则 9）
- [ ] `npm run typecheck` 0 错误（strict 全项）
- [ ] `npm run build` 成功，`dist/` 三入口 + 静态资源完整
- [ ] 界面层改动已在浏览器真实加载 `dist/` 并跑过 §3 的回归清单（含加载 / 空 / 错误 / 重试 / 反馈 / 可访问性，原则 6）
- [ ] 文档同步：`README.md`（命令/用法/功能）、`tts-relay/README.md`（中转服务）、`RULES.md`（代码地图）
- [ ] 关键架构决策已同步 `docs/adr/`；技术债务已登记 `docs/tech-debt.md`（原则 8）
- [ ] 跨平台检查：代码 / 脚本 / 命令示例遵循 §6
- [ ] 版本号已按 §4.3 升级（`package.json` + `public/manifest.json` 同步）
- [ ] 分支已提请用户手动合并（`--no-ff`），分支名 / 验证结果 / 合并命令已交付
- [ ] 工作区干净：`git status --short` 为空

---

## 6. 跨平台与代码硬约束

本项目是 Chrome 扩展，运行在浏览器沙箱内，没有 Node / Shell 能力，但**源码与构建脚本**
仍需跨平台可构建、可协作：

- **源码统一 LF、UTF-8 无 BOM**；读外部文件注意 strip `\r`（`prettier` 的 `endOfLine: lf`
  已强制；`.gitattributes` 建议配 `* text=auto eol=lf`）。
- **import 路径大小写与磁盘完全一致**（Linux 大小写敏感，CI 会暴露）。
- `package.json` 的 scripts 一律 `node esbuild.config.mjs` / `tsc` / `prettier` 形式，
  不写 `rm -rf` / `&&` 链 / `$(...)` 等 POSIX 专属写法；构建脚本（`esbuild.config.mjs`）
  内部路径用 `node:path` / `path.join`，不硬编码分隔符。
- **不要在扩展代码里出现任何 Node 专属 API**（`fs` / `path` / `os` / `child_process`）：
  background / content / popup 都只能用 `chrome.*` 与 Web API。
- 不硬编码绝对路径（用户的家目录、项目目录）；资源路径走 `chrome.runtime.getURL()`。
- `public/` 里的资源文件名只用小写 + 连字符 / 下划线，不含空格与中文，避免 URL 编码问题。
- 新增依赖须考虑：MV3 Service Worker 环境（不能用 Node 专属模块）、CSP（不引需要在页面
  注入 inline script 的包）。

**原则硬约束（§0，与上述平台约束并列执行）**：

- **单文件 ≤ 500 行**（原则 2）：含 `.css` 等资源文件；接近 400 行主动规划拆分。
  历史超限项已全部拆分完成（见 `docs/tech-debt.md` 的解决记录），拆分后的
  **隐性契约**（初始化顺序、styles 拼接即级联顺序、`collectPageUnits` 输出形状等）
  亦见该表，改动这些模块前必读。
- **四类模型不泄漏**（原则 3）：协议 / 领域 / 持久化 / 视图模型到本项目的映射见 §0.2；
  `shared/**` 不得 import 任何层模块、不得持有层 state；视图层不得绕过 `shared/settings` 直写 storage。
- **依赖先核查再引入**（原则 7）：先查根 `package.json` 与 `tts-relay/package.json` 的已有依赖、
  官方文档与类型定义，确认都不能满足后才引入成熟且维护良好的库。
- **日志不泄露敏感信息**（原则 9）：`shared/log.ts` 的输出保留诊断上下文
  （模块前缀 / 状态码 / 错误分类），但**不得打印 API Key、中转 Token、用户正文全文**。
- **删除优于兼容**（原则 10）：内部路径重构直接删旧实现并同步所有调用方；
  兼容只在 §1.2 标注【对外】的契约上按合同义务保留。

---

## 7. 已知坑与约束（踩过，别重踩）

- **`dist/` 不入库**：构建产物，`npm run build` 生成；交付前必须确认完整（三入口 js
  + manifest + popup.html/css + `_locales` + icons）。
- **悬浮窗可能未创建**：任何 `getWidget()` 调用都必须处理 null（§1.1）。
- **`state` 的 DOM 引用是运行时填充的**：由 `index.ts` 的 `initWidget` 在创建 widget 后
  赋值，模块加载期为 null —— 类型上是 `HTMLElement | null`，访问用 `!` 或判空。
- **content 与 popup 的 state 是两个独立对象**：不要试图共享或互相 import；
  共享逻辑一律下沉到 `shared/`（纯函数 / 类，不持有任何层 state）。
- **Shadow DOM 内的 DOM 引用**用 `getWidgetElementById` / `getWidget().querySelector`，
  **不要**用 `document.getElementById`（会拿到页面的，不是悬浮窗的）。
- **本地容灾是会话级**：`state.localFallbackActive` 在停止 / 清空 / 新建播放时重置，
  恢复网络或填好 Key 后重新播放自动回到 MiMo；本地路径无播放句柄，
  暂停 / 恢复走 `speechSynthesis`。
- **逐句高亮的「规范路径」自检**：仅当文本框内容与 `getDisplayTextFromMap(map)` 完全一致
  时才走 DOM 回指高亮；用户手改 / 粘贴 / 选中朗读时自检不成立，自动降级为仅悬浮窗高亮。
- **`_locales` 的 2 个语言文件（en / zh_CN）不要动**：i18n 键保持既有集合不变；新功能文案写死中文。
- **MV3 Service Worker 会被休眠**：长时间任务不要放在 background；TTS 是一次性请求-响应，
  缓存 / 播放都在 content / popup 侧；background 不持有可变全局状态，持久化写 `chrome.storage`。
- **strictNullChecks 下的事件回调**：`e.target` 常需 `as HTMLElement`；
  `catch (e)` 的 `e` 是 `unknown`，属性访问需断言（`useUnknownInCatchVariables` 已开）。
- **500 行硬约束已清零**：历史超限文件（`widget.ts` 2020 / `language-names.ts` 1629 /
  `detect-language.ts` 871 / `player.ts` 905 / `popup.css` 820 / `index.ts` 829 /
  `extractor.ts` 583 / `ui.ts` 503 / `voices.ts` 560）均已拆分为子目录，
  全仓库 130 个 ts/css 源文件现在均 ≤ 500 行，详见 `docs/tech-debt.md`。
  **统计行数必须用 node 的 `split('\n').length`**：PowerShell
  `Measure-Object -Line` 会系统性少算（如 widget.ts 报 1750，实测 2020）。
- **上下文进 ADR 与债务表，不要只留在聊天记录里**（原则 8）：关键架构决策写 `docs/adr/`；
  已知缺陷 / 临时方案 / 兼容约束写 `docs/tech-debt.md`（含原因 / 影响范围 / 潜在风险 / 移除条件）。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **WebReader** (4162 symbols, 8367 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/WebReader/context` | Codebase overview, check index freshness |
| `gitnexus://repo/WebReader/clusters` | All functional areas |
| `gitnexus://repo/WebReader/processes` | All execution flows |
| `gitnexus://repo/WebReader/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
