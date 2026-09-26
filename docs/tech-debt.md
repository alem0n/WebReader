# 技术债务登记表

WebReader 的已知缺陷、临时方案与待清理项。每条写明**原因 / 影响范围 / 潜在风险 /
移除条件**（`AGENTS.md` §0 原则八要求），避免留下缺少上下文的 TODO。

本仓库无独立 issue tracker，引用时用条目 ID（commit message / 分支名可带 `TD-00x`）。
**登记不是许可**：清理由此表排队，改动到相关文件时优先顺手处理。

## 当前状态

**当前有 1 项未解决的技术债务**（TD-013，托盘无法直接输入任意端口，见文末）。
历史登记如下，均已解决或关闭；各条的解决记录
（方案 / 保真 / 影响 / 验证）已随清理归档进提交历史，不再在此堆积：

| ID | 主题 | 结局 |
| --- | --- | --- |
| TD-001 | `content/widget.ts` 超限（2020 行） | 拆为 `widget/`，最大 421 行 |
| TD-002 | `shared/language-names.ts` 超限（1629 行） | 拆为 `language-names/`，最大 212 行 |
| TD-003 | `shared/detect-language.ts` 超限（871 行） | [ADR 0002](adr/0002-voice-default-from-interface-language.md) 取消自动检测后零引用，整体删除 |
| TD-004 | `content/player.ts` 超限（905 行） | 拆为 `player/`，最大 208 行 |
| TD-005 | `public/popup.css` 超限（820 行） | 拆为 7 个 `popup-*.css`，最大 324 行 |
| TD-006 | `content/index.ts` 超限（829 行） | 拆为 `widget-init/` 等，`index.ts` 降至 148 行 |
| TD-007 | `content/extractor.ts` 超限（583 行） | 拆为 `extractor/`，最大 142 行 |
| TD-008 | `content/ui.ts` 超限（503 行） | 拆为 `ui/`，最大 316 行 |
| TD-009 | `PresetVoice.gender` 注释过时 | 注释已修正 |
| TD-010 | `content/voices.ts` 超限（560 行） | 拆为 `voices/`，最大 353 行 |
| TD-011 | popup 音色状态机同源缺陷 | [ADR 0002](adr/0002-voice-default-from-interface-language.md) 取消自动检测后互斥状态机删除，关闭 |
| TD-012 | 旧版残留音色顶替界面语言默认 | 新增 `voiceSelectionIsManual` 标志修复，旧数据一次性自愈迁移 |

拆分用提取脚本逐字节回比 + 函数级回比保真；**当前全仓库 130 个 `ts` / `css`
源文件均 ≤ 500 行**（原则 2 清零）。

新发现的债务续登于下，ID 自 **TD-013** 顺延，格式沿用「原因 / 影响范围 /
潜在风险 / 移除条件」。

### TD-013 — 托盘无法直接输入任意端口 / 配置值

- **原因**：`systray2` 只支持菜单项（勾选 / 子菜单 / 分隔符），没有文本输入弹窗；
  跨平台做原生输入框需平台特异实现（Windows InputBox / Linux xdialog），
  与「单一跨平台路径」的取舍冲突，故 ADR 0004 选择了折中：常用端口快捷项 +
  「打开配置文件」手改 +「重新加载配置」。
- **影响范围**：`tts-relay/src/tray/menu.ts`（`PORT_CHOICES`）、
  `relay-tray.ts`（`open-config-file` / `reload-config` 派发）、README 端口说明。
- **潜在风险**：非常用端口的用户必须手改 JSON 并记得「重新加载配置」，多一步操作；
  快捷项集合不可能覆盖所有人。
- **移除条件**：引入本地配置页（如复用 HTTP 服务起一个 `/_config` 页面）或改用
  支持输入的托盘 / 桌面框架（Tauri 等）后，删除快捷项折中并更新 ADR 0004。

## 行数统计方法修正（重要）

原登记表与 `AGENTS.md` 的行数普遍偏小，原因是**统计方法错误**：
PowerShell `Get-Content | Measure-Object -Line` 会少算（如 `widget.ts` 报 1750，
实测 **2020**）。统计行数必须用 node：

```js
require('fs').readFileSync(path, 'utf8').split('\n').length;
```

或 `wc -l`（Linux）。已同步修正 `AGENTS.md` §7 与 `RULES.md` 的行数引用。

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
- **`detect-language` 已删除**（ADR 0002）：不再约束，本仓库无语言检测模块。
- **`state.selectedVoice` 是「当前要使用的音色」的单一来源**（两层同构）：音色列表
  加载完成后不为 null。`voiceSelectionIsManual` 只决定它由谁产生——`true` 为
  用户手选（按 name 持久化，界面语言切换不覆盖）；`false` 时由
  `voices/voice-selection.ensureVoiceSelected` → `shared/voice-default.pickDefaultVoice`
  按界面语言派生并写入（不落盘，跟随界面语言），调用点为「音色加载完成 /
  界面语言切换 / 开始播放」三处。`navigation.jumpToSentence`、下拉选中态
  （`dropdown.renderVoiceDropdown`）、语言过滤（`filterVoices`）一律只读
  `selectedVoice`，**不得重新派生**。任何「派生即置 `selectedVoice = null`"
  的写法都是本设计的反面（曾导致整页朗读点击跳转失效）。

## 关联

- `AGENTS.md` §0 原则 2、§7 已知坑、§3 浏览器手动回归清单
- `RULES.md` 各模块条目（代码地图）
- `docs/adr/0001-core-engineering-principles.md`
