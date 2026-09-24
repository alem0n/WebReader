# 技术债务登记表

WebReader 的已知缺陷、临时方案与待清理项。每条写明**原因 / 影响范围 / 潜在风险 /
移除条件**（`AGENTS.md` §0 原则八要求），避免留下缺少上下文的 TODO。

本仓库无独立 issue tracker，引用时用条目 ID（commit message / 分支名可带 `TD-00x`）。
**登记不是许可**：清理由此表排队，改动到相关文件时优先顺手处理。

## 汇总

原 TD-001…TD-009 已全部解决（含复核时新发现并一并清理的 TD-010）。
**截至当前版本，全仓库 130 个 `ts` / `css` 源文件已全部 ≤ 500 行，原则 2 清零。**
TD-011 是音色状态机修复时发现的 popup 层同源缺陷，未修（见下）。

| ID | 主题 | 原登记行数 | 实测行数 | 拆分后 | 解决提交 |
| --- | --- | --- | --- | --- | --- |
| TD-001 | `content/widget.ts` 超限 | 1750 | **2020** | `widget/` 8 文件，最大 421 | `a93c6f6` + `52a61de` |
| TD-002 | `shared/language-names.ts` 超限 | 1629 | 1629 | `language-names/` 21 文件，最大 212 | `ee59693` |
| TD-003 | `shared/detect-language.ts` 超限 | 871 | 871 | `detect-language/` 7 文件，最大 241 | `94bd687` |
| TD-004 | `content/player.ts` 超限 | 789 | **905** | `player/` 8 文件，最大 208 | `4ce867b` |
| TD-005 | `public/popup.css` 超限 | 699 | **820** | 7 个 `.css`，最大 324 | `764c77d` |
| TD-006 | `content/index.ts` 超限 | 699 | **829** | `index.ts` 148 + `widget-init/` 8 文件（最大 159）+ `background-messages.ts` + `page-listeners.ts` | `67b3e1a` |
| TD-007 | `content/extractor.ts` 超限 | 583 | 583 | `extractor/` 8 文件，最大 142 | `0ee0dd0` |
| TD-008 | `content/ui.ts` 超限 | 503 | 503 | `ui/` 7 文件，最大 316 | `6e7ca42` |
| TD-009 | `PresetVoice.gender` 注释过时 | — | — | 注释修正 | `1f6ed71` |
| TD-010 | `content/voices.ts` 超限（漏登） | — | 560 | `voices/` 4 文件，最大 353 | `35cb101` |
| TD-011 | popup 层音色状态机同源缺陷（未修） | — | — | 见 TD-011 条目 | 待后续分支 |

> 「原登记行数」来自本表旧版本；**实测行数**用正确方法重新统计（见下节），
> 多数条目被低估。此后登记行数一律以实测为准。

### 行数统计方法修正（重要）

原登记表与 `AGENTS.md` 的行数普遍偏小，原因是**统计方法错误**：
PowerShell `Get-Content | Measure-Object -Line` 会少算（如 `widget.ts` 报 1750，
实测 **2020**）。统计行数必须用 node：

```js
require('fs').readFileSync(path, 'utf8').split('\n').length;
```

或 `wc -l`（Linux）。已同步修正 `AGENTS.md` §7 与 `RULES.md` 的行数引用。

---

## 解决记录

每项拆分均满足原移除条件：**每个文件 ≤ 500 行**、`npm run verify` 通过、
对外 import 路径与导出形状不变、相关 `test/*.mjs` 冒烟通过。界面层的浏览器
手动回归（`AGENTS.md` §3）见各提交说明，由改动人执行。

### 通用保真手段

纯数据 / 模板类拆分（TD-001、TD-002、TD-005）用**提取脚本 + 逐字节回比**：
脚本切出原文片段并断言不含反引号 / `${` / 反斜杠，拆分后重新拼回并与原文
（`git show HEAD:<path>`）逐字符比较，级联顺序与数据内容零漂移。

逻辑类拆分（TD-003、TD-004、TD-006…TD-008、TD-010）用**函数级回比**：
抽取旧文件每个函数的完整文本，去注释 / 空白 / `export` 后与新文件逐字比较
（TD-004 的 19 个函数中 15 个逐字一致，其余 4 个仅注释位置不同）。

### TD-001 — `content/widget.ts`（实测 2020 行）

- **方案**：按「资源与装配分离」拆为 `widget/icons.ts`（SVG 精灵）、
  `widget/template.ts`（HTML 结构模板，i18n 插值 + 音色面板折叠态）、
  `widget/styles*.ts`（CSS：base / panel / controls / theme 四段 + 顺序聚合器）、
  `widget/index.ts`（创建与 Shadow DOM 挂载）。`styles.ts` 起初拆成单文件
  仍有 1435 行，二次提交按分区注释再拆为四段。
- **保真**：`WIDGET_ICON_SPRITES + HTML 段` 与四段 CSS 拼接，在源码层与运行时层
  均与旧 `innerHTML` / `style.textContent` 逐字节相同（33303 字符 CSS）。
- **新增测试**：`test/widget.smoke.mjs`（15 例），填补 `createWidget` 此前完全没有
  自动化覆盖的空白。

### TD-002 — `shared/language-names.ts`（1629 行）

- **方案**：按表拆为 `language-names/`（`language-names-en` / `country-names-en` /
  `gender-translations` + 17 个按语言文件 + `index.ts` 聚合 5 个公共导出）。
- **保真**：39 张表与旧文件逐键 0 差异。

### TD-003 — `shared/detect-language.ts`（871 行）

- **方案**：先补 `test/detect-language.behavior.mjs`（36 例）锁定既有行为，
  再拆为 `detect-language/`（`index` 检测编排 + 平局规则、`script-fallback`、
  `scoring` + 4 个词表）。
- **保真**：21 个词表 0 差异，36/36 行为用例保持通过。
- **注意**：部分样本按当前算法分类「不正确」（fr→it-IT、pt→vi-VN、ro→vi-VN、
  bg→ru-RU、nb→da-DK），属**既有行为**，测试以快照方式锁定，不得借重构「修正」。

### TD-004 — `content/player.ts`（实测 905 行）

- **方案**：按职责拆为 `player/`（`playback` / `chunk`（MiMo + 本地容灾）/
  `navigation` / `entire-page` / `stop-clear` / `paste` / `scroll` / `index` 聚合）。
- **唯一状态迁移**：模块级 `localFallbackActive` 移入 `state.localFallbackActive`
  （与 `isCancelled` 等会话级标志同列），消除跨子模块共享可变状态；其余逻辑零改动。
- **保真**：19 个函数全部一致（见上节）。
- **测试修复**：`play-entire-page.smoke.mjs` 桩补齐 `createLogger` / `debounce` /
  `limitFloat` / `persistSettings` / `readSettings` / `TOGGLE_SETTINGS` / `localTts.*`
  与子目录深一层的路径正则，恢复 4/4。

### TD-005 — `public/popup.css`（实测 820 行）

- **方案**：按界面分区拆为 7 个 `popup-*.css`，由 `popup.html` 顺序 `<link>` 引用
  （不改构建，`public/` 原样复制）。
- **保真**：拼接后规则与旧文件逐字节一致（15480 字符）。

### TD-006 — `content/index.ts`（实测 829 行）

- **方案**：初始化步骤按域拆为 `widget-init/`（dom-refs / auth-screen / audio-player /
  theme / global-bridge / voice-search / language-select / controls），
  background 消息监听 → `background-messages.ts`，网页点击跳转与划词监听 →
  `page-listeners.ts`；`index.ts` 只保留模块级注册与初始化编排顺序（148 行）。

### TD-007 — `content/extractor.ts`（583 行）

- **方案**：拆为 `extractor/`（selectors / site-rules / skip-patterns /
  pattern-match / block-detection / addressable-text / traversal / index 编排 + 再导出）。
- **保真**：`extractor.smoke.mjs` 20/20。

### TD-008 — `content/ui.ts`（503 行）

- **方案**：拆为 `ui/`（screens / drag / time-progress / text-highlight /
  controls / tooltips / index 再导出 23 个公共符号）。

### TD-009 — `PresetVoice.gender` 注释过时

- **修正**：`shared/types.ts` 注释改为说明该字段由 relay 音色的后端 `Gender` 填充，
  供两层 voices 模块展示与搜索；MiMo 预置音色不填。

### TD-010 — `content/voices.ts`（漏登，实测 560 行）

- **发现**：原登记表因行数统计方法缺陷漏登（旧方法报 <500）。
- **方案**：拆为 `voices/`（`format` 显示格式化纯函数 / `loader` 缓存 + 拉取 + 重试 /
  `dropdown` 过滤 / 渲染 / 选择 / `index` 聚合），依赖方向无环：
  `format ← dropdown ← loader`。
- **保真**：11 个函数（含 3 个私有）全部一致。

### TD-011 — popup 层音色状态机与 content 层同源缺陷（未修，待后续）

- **现象**：popup 层同样把「自动检测」与「已选音色」做成交斥：`popup/index.ts:64`
  （autoDetect 开启 → `selectedVoice = null`）与 `popup/voices.ts:68`（加载后
  autoDetect 开启 → `selectedVoice = null`），以及清除按钮置空后 autoDetect 仍关闭
  的不自洽态（与 content 修复前完全同构）。
- **为何本次不修**：popup 无网页内点击跳转，该缺陷不产生「整页点击跳转失效」这类
  现象；且 popup 层无自动化测试覆盖，改动必须浏览器手动回归（`AGENTS.md` §3），
  与本次 content 层修复混在同一分支会扩大回归面。
- **影响范围**：popup 主界面的音色下拉选中态 / 语言过滤 / 「清除后未重开自动检测
  则播放报请选择音色」的脆弱性。
- **潜在风险**：popup 与 content 是两套独立 state（`AGENTS.md` §7），不能共享修复；
  硬套 content 的 `resolveVoiceForText` 会引入 popup 未覆盖的检测分支。
- **移除条件**：按 content 层同一设计（`selectedVoice` 单一来源 + autoDetect 只决定
  产生方式）重写 popup 选音色路径，并完成 popup 浏览器手动回归后删除本条。

---

## 拆分后仍须遵守的隐性契约（改动这些模块前必读）

拆分只移动了代码位置，以下**不变量**依然是硬约束：

- **`content/index.ts` 初始化顺序**：挂载 → 填充 `state` 的 DOM 引用 → 绑定 → 加载。
  `state` 的 DOM 引用在 `initWidget` 之后才非空（`AGENTS.md` §7）。
- **`content/widget/` 挂载顺序**：先建 host + Shadow DOM → 塞 `<style>` → 塞 widget →
  最后调 `_widgetInitializer`。`getWidget()` 可能为 null（悬浮窗未创建），调用方必须判空。
  **`styles.ts` 的四段拼接顺序即 CSS 级联顺序**，调整段落顺序会改变主题与覆盖关系。
- **`state.localFallbackActive` 是会话级**：停止 / 清空 / 新建播放时重置；
  本地容灾路径无播放句柄，暂停 / 恢复走 `speechSynthesis`（`AGENTS.md` §7）。
- **`extractor` 的 `collectPageUnits` 输出是硬契约**：文档序、非重叠、与 DOM 逐字对齐，
  被 `sentence-map` 反查与逐句高亮依赖；采集必须**只读**（不改页面 DOM）。
- **`sentence-map` / `reading-overlay` 的括号处理**：句子 span 覆盖「合并区间」，
  被剔除的括号内容仍在 span 内（随句高亮但不朗读）——不要用 `map.sentences` 长度
  断言 span 长度（见 `test/inline-reading.smoke.mjs` 的幂等用例）。
- **`detect-language` 的既有输出不得借重构修正**（见 TD-003）。
- **`state.selectedVoice` 是「当前要使用的音色」的单一来源**（content 层）：音色列表
  加载完成且有正文后不为 null。`autoDetectLanguage` 只决定它由检测产生还是用户手选——
  开启时由 `voices/voice-selection.resolveVoiceForText` 在「开始播放 / 开关开启 /
  加载完成且有正文」时检测并写入（含「检测为空脚本回退」与「无匹配音色回退
  mimo_default」两道兜底）；关闭时是用户手选值。`navigation.jumpToSentence`、
  下拉选中态（`dropdown.renderVoiceDropdown`）、语言过滤（`filterVoices`）一律只读
  `selectedVoice`，**不得重新检测**。任何「autoDetect 开启就置 `selectedVoice = null`"
  的写法都是本设计的反面（曾导致整页朗读点击跳转失效）。

## 关联

- `AGENTS.md` §0 原则 2、§7 已知坑、§3 浏览器手动回归清单
- `RULES.md` 各模块条目（代码地图）
- `docs/adr/0001-core-engineering-principles.md`
