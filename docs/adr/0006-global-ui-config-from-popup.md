# ADR-0006 —— 界面语言与主题统一由主页配置，悬浮窗经存储变更监听跟随

- **状态**：采纳
- **日期**：2026-09-27

## 背景

悬浮窗标题栏原本自带三组与外观有关的入口：界面语言按钮（国旗胶囊 + 顶部滑出
语言条 + 隐藏的原生下拉）、主题切换按钮（亮 / 暗）、应用图标的描边。主页
（popup）标题栏另外也有一枚中 / EN 语言按钮。这带来三个问题：

1. **两处配置来源，状态会漂移**：语言写 `chrome.storage.local` 的
   `interfaceLanguage`（两处共享，尚算一致），但主题写的是**网页自身的**
   `localStorage['tts-theme']`——主页弹窗与网页悬浮窗各存一份、互不可见，
   同一扩展在不同界面呈现不同主题；
2. **悬浮窗空间被挤占**：标题栏塞了语言胶囊 + 最小化 + 主题 + 关闭四个按钮，
   而语言与主题都是低频全局配置，放在逐页悬浮窗里属于错配；
3. **主页缺主题入口**：主页是全局配置中心（引擎、音色、语速、开关都在此），
   偏偏没有主题切换，用户只能去网页悬浮窗里切，且切了也不同步到主页。

## 决策

**界面语言与主题都只在家（popup 主页标题栏）配置一次，悬浮窗只读、且即时跟随。**

- **语言**：删除悬浮窗的语言按钮 / 语言条 / 原生下拉及其绑定（`widget-init/
  language-select.ts` 整文件删除、`content/i18n.ts` 中只服务该 UI 的
  `updateLanguageSelectTooltip` / `updateLanguageButtonIcon` /
  `getFlagSymbolId` 一并删除）。悬浮窗启动时仍按 `loadInterfaceLanguage()`
  从存储读取并应用，**不再提供修改入口**
- **主题**：新增存储键 `interfaceTheme`（`shared/constants.ts`，值为
  `'dark'` 启用暗色，其余为亮色），读写收敛到 `shared/settings.ts` 的
  `readInterfaceTheme` / `writeInterfaceTheme`，取代原网页级
  `localStorage['tts-theme']`。切换入口移到主页标题栏（`src/popup/theme.ts` +
  `public/popup-theme.css`），悬浮窗删除主题按钮与 `state.themeToggleBtn`
- **即时跟随**：新增 `src/content/storage-sync.ts`，模块级注册
  `chrome.storage.onChanged`：主页改了 `interfaceLanguage` 就重载 i18n 并
  重新应用（未手选音色时默认音色按新语言重新派生，沿用 ADR-0002 的单一来源）；
  改了 `interfaceTheme` 就增删悬浮窗的 `dark-theme` 类
- **避免主题闪烁**：悬浮窗创建时即读存储打好 `dark-theme` 类
  （`widget/index.ts` 与折叠态偏好并行读取），不再等挂载后异步切类
- **图标描边**：品牌图标 `icon-app-neon` 去掉 `stroke`，贴合 DESIGN.md 的
  「颜色本身即按钮」方向；`icon-sun` / `icon-moon` 精灵随主题按钮迁到主页

## 结果

- **正面影响**：
  - 主题与语言成为**全局单一来源**：主页改一次，所有已打开的网页悬浮窗即时
    跟随，两套界面永不再不一致
  - 悬浮窗标题栏精简为「品牌 + 最小化 + 关闭」，低频全局配置回归主页
  - 主题从「每网页各存一份」升级为跨页面共享，符合「全局配置」的领域直觉
- **代价 / 风险**：
  - **行为变化**：主题不再是「每个网站分别记忆」。原 `localStorage
    ['tts-theme']` 的存量为每网页自身的 localStorage，与扩展存储隔离，
    升级后旧值不再读取（良性孤儿，不涉及扩展存储迁移）
  - 依赖 `chrome.storage.onChanged`（`storage` 权限已在 manifest 中，
    content / popup / background 均可用）
- **触发重评估的条件**：
  - 出现「不同网页想要不同界面语言 / 主题」的强诉求——届时需改为
    「主页设全局默认 + 悬浮窗可临时覆盖」的双层模型，并重新引入悬浮窗入口
  - `chrome.storage.onChanged` 的实时性无法满足体感要求时（目前为同步广播，
    无需额外消息通道）

## 反向链接

- `AGENTS.md` §1.1 决策日志（本决策已登记）、§1.2 存储键名清单（新增
  `interfaceTheme`）
- `docs/adr/0002-voice-default-from-interface-language.md`（语言单一来源的
  上游决策，本 ADR 复用其「未手选音色随界面语言重派生」规则）
- `RULES.md` `content/` 与 `popup/` 代码地图条目
- `src/content/storage-sync.ts`、`src/popup/theme.ts`、
  `src/content/widget-init/theme.ts`、`public/popup-theme.css`
