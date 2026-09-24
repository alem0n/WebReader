# 技术债务登记表

WebReader 的已知缺陷、临时方案与待清理项。每条写明**原因 / 影响范围 / 潜在风险 /
移除条件**（`AGENTS.md` §0 原则八要求），避免留下缺少上下文的 TODO。

本仓库无独立 issue tracker，引用时用条目 ID（commit message / 分支名可带 `TD-00x`）。
**登记不是许可**：清理由此表排队，改动到相关文件时优先顺手处理。

## 汇总

| ID | 主题 | 违反原则 | 现状（v0.9.0 行数） |
| --- | --- | --- | --- |
| TD-001 | `content/widget.ts` 超限 | 原则 2（≤500 行） | 1750 |
| TD-002 | `shared/language-names.ts` 超限 | 原则 2 | 1629 |
| TD-003 | `shared/detect-language.ts` 超限 | 原则 2 | 871 |
| TD-004 | `content/player.ts` 超限 | 原则 2 | 789 |
| TD-005 | `public/popup.css` 超限 | 原则 2 | 699 |
| TD-006 | `content/index.ts` 超限 | 原则 2 | 699 |
| TD-007 | `content/extractor.ts` 超限 | 原则 2 | 583 |
| TD-008 | `content/ui.ts` 超限 | 原则 2 | 503 |
| TD-009 | `PresetVoice.gender` 注释过时 | 原则 8（上下文准确） | `shared/types.ts:14` |

> 行数随版本变化，处理前以当前工作区实测为准。全部超限项的共同移除条件：
> 拆分为单一职责模块后**每个文件 ≤ 500 行**，`npm run verify` 通过，且涉及的界面层
> 按 `AGENTS.md` §3 跑浏览器手动回归。

---

## TD-001 — `content/widget.ts` 超限（1750 行，最严重）

- **违反原则**：原则 2（单文件 ≤ 500 行）
- **原因**：悬浮窗的 HTML 模板字符串、CSS 文本、Shadow DOM 挂载逻辑、DOM 查询助手
  全堆在一个文件里，早期为了「创建流程在一个地方看完」而未拆分。
- **影响范围**：`content/index.ts`（`initWidget`）、`reading-styles.ts`、所有
  `getWidget()` / `getWidgetElementById()` 调用点。
- **潜在风险**：模板与样式继续膨胀会进一步推高行数；拆分时须保持 Shadow DOM
  **先挂载后填充**的顺序与 `getWidget()` 的可空语义（`AGENTS.md` §7）。
- **移除条件**：模板常量 → `widget-template.ts`；CSS → `widget-styles.ts`
  （与 `reading-styles.ts` 统一样式注入策略）；挂载与查询助手留在 `widget.ts`；
  导出形状不变，回归通过。
- **关联**：`RULES.md` `content/widget.ts` 条目；ADR-0001

## TD-002 — `shared/language-names.ts` 超限（1629 行）

- **违反原则**：原则 2
- **原因**：语言 / 国家 / 性别名的翻译常量表是**数据**而非逻辑，单文件堆积。
- **影响范围**：popup / content 的音色与界面语言显示（`i18n.ts`）。
- **潜在风险**：纯数据表合并风险低，但拆分须保持**唯一导出入口**不变，
  避免两层 import 路径漂移；注意 bundle 体积（两入口都引全表，暂无按需加载）。
- **移除条件**：按表拆为 `language-names/` 子目录（language / country / gender）
  + `index.ts` 聚合导出，外部 import 路径不变。
- **关联**：`RULES.md` `shared/language-names.ts` 条目；ADR-0001

## TD-003 — `shared/detect-language.ts` 超限（871 行）

- **违反原则**：原则 2
- **原因**：语言特征权重常量表与加权检测算法、短文本字符脚本回退混在一起。
- **影响范围**：自动语言检测开关路径（`AGENTS.md` §3 回归项）。
- **潜在风险**：检测是**纯函数**，拆分须保持签名与结果完全不变；建议补离线单测
  （`test/`，node 直跑）锁定行为再动刀。
- **移除条件**：分数 / 特征常量单独成模块，检测算法与回退各自成模块，对外函数不变。
- **关联**：`RULES.md` `shared/detect-language.ts` 条目；ADR-0001

## TD-004 — `content/player.ts` 超限（789 行）

- **违反原则**：原则 2（同时离原则 3 的「视图模型单一职责」较近）
- **原因**：MiMo 路径（Web Audio）与本地容灾路径（speechSynthesis）双分支、
  整页收集、粘贴并朗读、逐句高亮联动、映射新鲜度自检全在一个播放控制器里。
- **影响范围**：`content/index.ts`、`reading-overlay.ts`、`sentence-map.ts`、
  `web-audio-player.ts`、`local-tts.ts`。
- **潜在风险**：**双分支状态机是本项目的核心风险区**——`localFallbackActive` 是会话级
  （停止 / 清空 / 新建播放时重置），本地路径无播放句柄、暂停 / 恢复走 `speechSynthesis`
  （`AGENTS.md` §7）。拆分必须先隔离「播放源接口」，再分离收集与联动逻辑。
- **移除条件**：抽统一的播放源接口（MiMo / 本地两实现），播放控制 / 收集 / 高亮联动
  / 自检各自成模块；本地容灾行为逐项与现状一致。
- **关联**：`RULES.md` `content/player.ts` 条目；`AGENTS.md` §7 本地容灾条目；ADR-0001

## TD-005 — `public/popup.css` 超限（699 行）

- **违反原则**：原则 2（资源文件同样约束）
- **原因**：主界面所有分区的样式（音色面板 / 配置面板 / 开关列 / 主题）单文件堆积。
- **影响范围**：`popup.html`；视觉基准见 `DESIGN.md`。
- **潜在风险**：popup **无 Shadow DOM**，样式全局生效，拆分须保证层叠顺序与主题变量
  不变；引入 CSS 拼接会改动 `esbuild.config.mjs` 的 public 复制逻辑，需同步构建验证。
- **移除条件**：按界面分区拆成多个 `.css`（由 `popup.html` 引用或构建期拼接），
  视觉与主题切换回归通过。
- **关联**：`DESIGN.md`；`RULES.md` `public/` 条目；ADR-0001

## TD-006 — `content/index.ts` 超限（699 行）

- **违反原则**：原则 2
- **原因**：`initWidget` 的初始化序列（音色 / 设置 / 高亮 / 快捷操作）与事件绑定、
  模块级 `selectionchange` / `mouseup` 监听全在入口文件里。
- **影响范围**：`content/state.ts`（DOM 引用由此填充）、各 content 子模块。
- **潜在风险**：**初始化顺序是隐性契约**——`state` 的 DOM 引用在 `initWidget` 之后才非空
  （`AGENTS.md` §7）；拆分必须保持「挂载 → 填充 state → 绑定 → 加载」的顺序。
- **移除条件**：初始化步骤按域拆成独立模块，入口只编排顺序；模块级全局监听单独成模块。
- **关联**：`RULES.md` `content/index.ts` 条目；`AGENTS.md` §7 state 条目；ADR-0001

## TD-007 — `content/extractor.ts` 超限（583 行）

- **违反原则**：原则 2
- **原因**：块级遍历、文本过滤、段落单元构造（与 DOM 逐字对齐的「可寻址文本」）混在一起。
- **影响范围**：`sentence-map.ts`（依赖单元的文档序与非重叠性）、`reading-overlay.ts`。
- **潜在风险**：`collectPageUnits` 的**输出形状是硬契约**（文档序、非重叠、与 DOM 逐字对齐），
  被 `sentence-map` 反查与逐句高亮依赖；采集必须保持**只读**（不修改页面 DOM）。
  建议先跑 `test/extractor.smoke.mjs` 锁定行为。
- **移除条件**：遍历 / 过滤 / 单元构造各自成模块，`collectPageUnits` 签名与输出不变。
- **关联**：`RULES.md` `content/extractor.ts` 条目；`test/extractor.smoke.mjs`；ADR-0001

## TD-008 — `content/ui.ts` 超限（503 行，刚越线）

- **违反原则**：原则 2
- **原因**：按钮状态 / 禁用提示 / 拖拽 / 高亮 / 主题五类界面行为合并。
- **影响范围**：`content/widget.ts`、`state.ts`。
- **潜在风险**：拖拽与最小化状态有持久化诉求，拆分时注意状态读写入口单一。
- **移除条件**：拖拽与主题各自成模块，按钮状态与提示留 `ui.ts`。
- **关联**：`RULES.md` `content/ui.ts` 条目；ADR-0001

## TD-009 — `PresetVoice.gender` 注释过时（`shared/types.ts:14`）

- **违反原则**：原则 8（为维护者保留准确上下文）
- **原因**：注释写「历史兼容字段（MiMo 预置音色不使用）」，但该字段实际被
  `content/voices.ts`（搜索过滤 / 详情展示）与 `popup/voices.ts`（搜索 / 展示）读取，
  用于**中转（relay）音色**（`/v1/voices` 返回 `Gender`，MiMo 预置音色不填）。
- **影响范围**：relay 链路的音色性别显示与搜索。
- **潜在风险**：维护者可能据注释**误删**该可选字段，导致中转音色的性别标注消失
  （MiMo 链路不受影响，回归时若只测 MiMo 不会暴露）。
- **移除条件**：改为准确注释——说明「MiMo 预置音色不填；relay 音色由后端 `Gender` 填充，
  供两层 voices 模块展示与搜索」。纯注释改动，`npm run verify` 即可。
- **关联**：`AGENTS.md` §1.2 storage / 错误响应契约；ADR-0001
