/**
 * 悬浮窗样式（Duolingo 设计规范，见 DESIGN.md；亮色主题 + .dark-theme 暗色变体）。
 *
 * 从 widget.ts 拆出（docs/tech-debt.md TD-001）：样式与结构/逻辑分离，
 * 跑在 Shadow DOM 内，与页面 CSS 完全隔离。
 */
export const WIDGET_STYLES = `
    /* ============================================================
       WebReader 网页悬浮窗 —— Duolingo 设计规范（DESIGN.md）
       白纸画布 · 圆角贴纸 · 2px 描边 · 单一饱和绿
       默认亮色主题；.dark-theme 为暗色变体（Night Ink 底）
       ============================================================ */

    #edge-tts-widget {
      /* Colors */
      --color-eager-green: #58cc02;
      --color-storybook-green: #d7ffb8;
      --color-spark-blue: #1cb0f6;
      --color-fresh-leaf: #a5ed6e;
      --color-night-ink: #000437;
      --color-paper-white: #ffffff;
      --color-charcoal: #4b4b4b;
      --color-pencil-gray: #777777;
      --color-faded-gray: #afafaf;
      /* 表面层 */
      --surface: var(--color-paper-white);
      --surface-card: var(--color-paper-white);
      --text-strong: var(--color-night-ink);
      --text-body: var(--color-charcoal);
      --text-muted: var(--color-pencil-gray);
      --option-hover: var(--color-storybook-green);

      /* Typography */
      --font-feather: 'Feather Bold', 'Nunito Black', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-sans: 'Nunito Sans', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

      position: fixed;
      top: 100px;
      right: 20px;
      width: 450px;
      max-height: 90vh;
      background: var(--surface);
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      z-index: 999999;
      font-family: var(--font-sans);
      font-size: 14px;
      display: flex;
      flex-direction: column;
      overflow: visible;
      color: var(--text-body);
      cursor: move;
      pointer-events: auto;
    }

    #edge-tts-widget button:not(:disabled),
    #edge-tts-widget input:not(:disabled),
    #edge-tts-widget select:not(:disabled),
    #edge-tts-widget label:has(input:not(:disabled)),
    #edge-tts-widget .btn:not(:disabled),
    #edge-tts-widget .voice-option {
      cursor: pointer;
    }

    #edge-tts-widget input:disabled,
    #edge-tts-widget select:disabled,
    #edge-tts-widget label:has(input:disabled) {
      cursor: not-allowed;
    }

    #edge-tts-widget .dropdown-list,
    #edge-tts-widget .dropdown-list * {
      cursor: default;
    }

    #edge-tts-widget .text-content {
      cursor: text;
      user-select: none;
    }

    /* ==================== 顶部头条（Storybook 绿底 + 品牌字） ==================== */

    .tts-widget-header {
      background: var(--color-paper-white);
      color: var(--color-night-ink);
      padding: 12px 16px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      border-radius: 10px 10px 0 0;
      border-bottom: 2px solid var(--color-eager-green);
      position: relative;
      z-index: 1;
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header-app-icon {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
    }

    .header-app-name {
      font-family: var(--font-feather);
      font-weight: 700;
      font-size: 21px;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: var(--color-eager-green);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .header-buttons {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    /* 头部小按钮：透明底 + 2px 描边 */
    .tts-widget-btn {
      background: transparent;
      border: 2px solid var(--color-night-ink);
      color: var(--color-night-ink);
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .tts-widget-btn svg {
      fill: var(--color-night-ink);
    }

    .tts-widget-btn:hover {
      background: var(--color-night-ink);
      color: var(--color-paper-white);
    }

    .tts-widget-btn:hover svg {
      fill: var(--color-paper-white);
    }

    .tts-widget-btn:active {
      transform: translateY(1px);
    }

    /* 语言选择按钮（国旗胶囊） */
    .language-select-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .language-button {
      background: var(--color-paper-white);
      border: 2px solid var(--color-night-ink);
      cursor: pointer;
      padding: 0;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      transition: background 0.15s ease, transform 0.1s ease;
    }

    .language-button:hover {
      background: var(--color-storybook-green);
    }

    .language-button:active {
      transform: translateY(1px);
    }

    .language-button svg.flag-icon {
      width: 22px;
      height: 22px;
      padding: 0;
      margin: 0;
    }

    .language-select-native {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 0;
      height: 0;
    }

    /* 横向语言条（从顶部滑出） */
    .language-strip {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      min-height: 64px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-paper-white);
      border-bottom: 2px solid var(--color-eager-green);
      border-radius: 12px 12px 0 0;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease-out;
      z-index: 5;
    }

    .language-strip.open {
      opacity: 1;
      pointer-events: auto;
    }

    .language-strip-inner {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      max-width: 100%;
      justify-content: center;
      align-items: center;
    }

    .language-strip-flag {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      border: 2px solid var(--color-faded-gray);
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-paper-white);
      cursor: pointer;
      transition: border-color 0.15s ease, transform 0.1s ease;
      flex: 0 0 auto;
    }

    .language-strip-flag:hover {
      border-color: var(--color-eager-green);
      transform: translateY(-1px);
    }

    .language-strip-flag:active {
      transform: scale(0.96);
    }

    .language-strip-flag svg.flag-icon {
      width: 22px;
      height: 22px;
      padding: 0;
      margin: 0;
    }

    /* ==================== 内容区 ==================== */

    .tts-widget-content {
      padding: 16px;
      overflow-y: visible;
      max-height: none;
      background: transparent;
      position: relative;
      z-index: 1;
      cursor: move;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .panel {
      background: var(--surface-card);
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      padding: 16px;
    }

    /* ==================== 音色 / 语速 / 开关 ==================== */

    .voice-selector {
      --voice-ctrl-height: 40px;
      --voice-ctrl-pad-x: 12px;
      position: relative;
    }

    .voice-panel-toggle {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 20;
      width: 26px;
      height: 26px;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      background: transparent;
      color: var(--text-muted);
      transition: color 0.15s ease, background 0.15s ease;
      pointer-events: auto;
      -webkit-appearance: none;
      appearance: none;
    }

    .voice-panel-toggle svg {
      display: block;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .voice-panel-toggle:hover {
      color: var(--color-night-ink);
      background: var(--color-storybook-green);
    }

    .voice-panel-toggle:focus-visible {
      outline: none;
    }

    .voice-selector--collapsed .voice-field-stack-speed,
    .voice-selector--collapsed .voice-loading,
    .voice-selector--collapsed .options-row {
      display: none !important;
    }

    .voice-selector--collapsed .voice-top-grid {
      flex-direction: column;
      align-items: stretch;
    }

    .voice-selector--collapsed .voice-field-stack:first-child {
      flex: none;
      width: 100%;
    }

    .voice-selector--collapsed .voice-field-stack:first-child > .voice-field-label {
      display: none !important;
    }

    .voice-selector--collapsed {
      padding: 12px;
    }

    /* 收起态：折叠按钮垂直居中到控件行右侧，输入框相应收窄避免被压住 */
    .voice-selector--collapsed .voice-panel-toggle {
      top: calc(12px + var(--voice-ctrl-height, 40px) / 2 - 13px);
      right: 6px;
    }

    .voice-selector--collapsed .voice-field-stack:first-child .dropdown-container {
      max-width: calc(100% - 30px);
    }

    .voice-top-grid {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }

    .voice-field-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .voice-field-stack:first-child {
      flex: 1;
    }

    .voice-field-stack-speed {
      flex-shrink: 0;
    }

    .voice-field-label {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.23;
      color: var(--text-muted);
      letter-spacing: 0.04em;
      padding-left: 2px;
    }

    .dropdown-container {
      position: relative;
      flex: 1;
    }

    #voice-search {
      width: 100%;
      box-sizing: border-box;
      height: var(--voice-ctrl-height, 40px);
      min-height: var(--voice-ctrl-height, 40px);
      padding: 0 32px 0 var(--voice-ctrl-pad-x, 12px);
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 14px;
      background: var(--color-paper-white);
      color: var(--text-body);
      outline: none;
      transition: border-color 0.15s ease;
    }

    #voice-search::placeholder {
      color: var(--color-faded-gray);
    }

    #voice-search:focus {
      border-color: var(--color-spark-blue);
    }

    #voice-search:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .voice-search-clear {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      width: 24px;
      height: 24px;
      z-index: 10;
      color: var(--text-muted);
    }

    .voice-search-clear svg {
      fill: currentColor;
      width: 16px;
      height: 16px;
    }

    .voice-search-clear:hover {
      background: var(--color-storybook-green);
      color: var(--color-night-ink);
    }

    .dropdown-list {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 300px;
      overflow-y: auto;
      background: var(--color-paper-white);
      border: 2px solid var(--color-night-ink);
      border-radius: 12px;
      z-index: 1000;
    }

    .dropdown-list.hidden {
      display: none;
    }

    .voice-option {
      padding: 12px;
      cursor: pointer;
      border-bottom: 2px solid var(--color-storybook-green);
      transition: background 0.12s ease;
      position: relative;
    }

    .voice-option:last-child {
      border-bottom: none;
    }

    .voice-option:hover {
      background: var(--option-hover);
    }

    .voice-option.selected {
      background: var(--color-storybook-green);
    }

    .voice-option.highlighted {
      background: var(--option-hover);
    }

    .voice-option-name {
      font-weight: 700;
      font-size: 14px;
      color: var(--text-strong);
    }

    .voice-option-details {
      font-size: 13px;
      line-height: 1.23;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* 音色加载指示 */
    .voice-loading {
      margin-top: 12px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: var(--text-strong);
      background: var(--color-storybook-green);
      border: 2px solid var(--color-eager-green);
      border-radius: 12px;
    }

    .voice-loading.hidden {
      display: none;
    }

    .spinner-small {
      width: 16px;
      height: 16px;
      border: 3px solid rgba(88, 204, 2, 0.3);
      border-top: 3px solid var(--color-eager-green);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      flex-shrink: 0;
    }

    /* Options Row（开关组） */
    .options-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    .options-row-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .auto-detect-column {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-width: 0;
      justify-content: center;
    }

    /* 复选框：圆角方块 + 2px 描边，选中绿色实心 */
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      color: var(--text-body);
      user-select: none;
      padding: 2px 0;
    }

    .checkbox-label:hover {
      color: var(--text-strong);
    }

    .checkbox-label input[type='checkbox'] {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      border: 2px solid var(--color-faded-gray);
      border-radius: 8px;
      background: var(--color-paper-white);
      position: relative;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .checkbox-label input[type='checkbox']:hover {
      border-color: var(--color-eager-green);
    }

    .checkbox-label input[type='checkbox']:checked {
      background: var(--color-eager-green);
      border-color: var(--color-eager-green);
    }

    .checkbox-label input[type='checkbox']:checked::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 1px;
      width: 5px;
      height: 10px;
      border: solid var(--color-paper-white);
      border-width: 0 3px 3px 0;
      transform: rotate(45deg);
    }

    .checkbox-label input[type='checkbox']:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .checkbox-label:has(input:disabled) {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* 语速下拉 */
    .speed-select {
      box-sizing: border-box;
      height: var(--voice-ctrl-height, 40px);
      min-height: var(--voice-ctrl-height, 40px);
      padding: 0 10px;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 700;
      background: var(--color-paper-white);
      color: var(--text-body);
      cursor: pointer;
      transition: border-color 0.15s ease;
      min-width: 92px;
      outline: none;
    }

    .speed-select option {
      background: var(--color-paper-white);
      color: var(--text-strong);
      padding: 8px;
    }

    .speed-select:focus {
      border-color: var(--color-spark-blue);
    }

    .speed-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* 语言下拉（保留方块按钮形态） */
    .language-select {
      width: 43px;
      height: 43px;
      padding: 0;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-size: 22px;
      background: var(--color-paper-white);
      color: var(--text-body);
      cursor: pointer;
      text-align: center;
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
    }

    .language-select option {
      background: var(--color-paper-white);
      color: var(--text-strong);
      padding: 8px 4px;
      font-size: 20px;
      text-align: center;
    }

    .language-select:focus {
      outline: none;
      border-color: var(--color-spark-blue);
    }

    .language-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ==================== API Key 提示界面 ==================== */

    .apikey-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
    }

    .apikey-hint-text {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--text-strong);
      line-height: 1.4;
    }

    .apikey-note {
      margin: 0;
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .apikey-link {
      color: var(--color-spark-blue);
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
    }

    .apikey-link:hover {
      text-decoration: underline;
    }

    .apikey-input {
      width: 100%;
      padding: 12px;
      border-radius: 12px;
      border: 2px solid var(--color-faded-gray);
      background: var(--color-paper-white);
      color: var(--text-body);
      font-family: var(--font-sans);
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .apikey-input:focus {
      border-color: var(--color-spark-blue);
    }

    .apikey-error {
      margin: 0;
      font-size: 12px;
      color: var(--color-night-ink);
      text-align: center;
      line-height: 1.4;
      font-weight: 700;
    }

    /* ==================== 文本显示 ==================== */

    .text-display {
      background: transparent;
      padding: 0;
    }

    .text-content {
      width: 100%;
      min-height: 200px;
      max-height: 300px;
      padding: 16px;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 15px;
      line-height: 1.6;
      background: var(--color-paper-white);
      overflow-y: auto;
      overflow-x: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      box-sizing: border-box;
      color: var(--text-body);
      display: block;
      transition: border-color 0.15s ease;
    }

    .text-content:focus-within {
      border-color: var(--color-spark-blue);
    }

    /* 空内容时缩小高度并居中占位文案 */
    .text-content:empty {
      min-height: 132px;
      max-height: 132px;
      overflow-y: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .text-content:empty::before {
      content: attr(data-placeholder);
      color: var(--color-faded-gray);
      font-style: italic;
      white-space: pre-line;
      display: block;
      text-align: center;
    }

    /* 正在朗读的高亮句：Storybook 绿底 + Night Ink 文字 */
    .text-content .highlight {
      background: var(--color-storybook-green);
      color: var(--color-night-ink);
      border-radius: 6px;
      padding: 1px 4px;
      margin: 0 1px;
    }

    /* ==================== 播放控制按钮 ==================== */

    .player-controls {
      display: flex;
      gap: 12px;
      flex-wrap: nowrap;
      justify-content: center;
      align-items: center;
      user-select: none;
      margin-bottom: 4px;
    }

    .btn {
      flex: 0 0 auto;
      width: 46px;
      height: 46px;
      padding: 0;
      border: 2px solid var(--color-faded-gray);
      background: transparent;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .btn-round {
      border-radius: 9999px;
    }

    .btn-square {
      border-radius: 12px;
    }

    .btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .btn-icon {
      width: 22px;
      height: 22px;
      fill: currentColor;
      pointer-events: none;
    }

    .btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* Primary CTA：实心绿 + 白字（颜色本身即按钮） */
    .btn-primary {
      background: var(--color-eager-green);
      border-color: var(--color-eager-green);
      color: var(--color-paper-white);
    }

    .btn-primary:hover:not(:disabled) {
      filter: brightness(1.07);
    }

    /* Outlined：透明底 + 2px 描边 + Spark Blue 图标 */
    .btn-secondary {
      border-color: var(--color-faded-gray);
      color: var(--color-spark-blue);
    }

    .btn-secondary:hover:not(:disabled) {
      border-color: var(--color-spark-blue);
      background: rgba(28, 176, 246, 0.1);
    }

    /* 整页朗读：绿色描边（progress / go 语义） */
    .btn-success {
      border-color: var(--color-eager-green);
      color: var(--color-eager-green);
    }

    .btn-success:hover:not(:disabled) {
      background: var(--color-storybook-green);
    }

    /* 停止清空：Night Ink 深色强调（危险操作的深色警示） */
    .btn-danger {
      border-color: var(--color-night-ink);
      color: var(--color-night-ink);
    }

    .btn-danger:hover:not(:disabled) {
      background: rgba(0, 4, 55, 0.08);
    }

    /* 停止清空与传输组分隔：圆点变体 + 左侧自动间距 */
    #clear-btn {
      margin-left: 8px;
    }

    /* ==================== 状态与错误 ==================== */

    .status-container {
      text-align: center;
      min-height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      cursor: move;
    }

    .status-text {
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.23;
    }

    .time-progress {
      color: var(--color-spark-blue);
      font-size: 13px;
      font-weight: 700;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      letter-spacing: 0.5px;
    }

    .time-progress.hidden {
      display: none;
    }

    .error-message {
      padding: 12px;
      background: var(--color-paper-white);
      border: 2px solid var(--color-night-ink);
      border-radius: 12px;
      color: var(--color-night-ink);
      font-size: 13px;
      line-height: 1.5;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      position: relative;
    }

    .error-message.warning {
      border-color: var(--color-night-ink);
      color: var(--color-night-ink);
    }

    .warning-button-preview {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .warning-button-preview .btn-preview {
      transform: scale(0.85);
    }

    .error-text {
      flex: 1;
      word-wrap: break-word;
      line-height: 1.5;
    }

    .error-close-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      color: var(--color-night-ink);
      width: 24px;
      height: 24px;
    }

    .error-close-btn svg {
      fill: currentColor;
      width: 16px;
      height: 16px;
    }

    .error-close-btn:hover {
      background: rgba(0, 4, 55, 0.1);
    }

    .error-message.hidden {
      display: none;
    }

    /* ==================== 滚动条 ==================== */

    .dropdown-list::-webkit-scrollbar,
    .text-content::-webkit-scrollbar {
      width: 8px;
    }

    .dropdown-list::-webkit-scrollbar-track,
    .text-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .dropdown-list::-webkit-scrollbar-thumb,
    .text-content::-webkit-scrollbar-thumb {
      background: var(--color-faded-gray);
      border-radius: 4px;
    }

    .dropdown-list::-webkit-scrollbar-thumb:hover,
    .text-content::-webkit-scrollbar-thumb:hover {
      background: var(--color-pencil-gray);
    }

    /* ==================== 用户菜单（覆盖层） ==================== */

    .user-menu-button {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid var(--color-night-ink);
      background: var(--color-eager-green);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: var(--color-paper-white);
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .user-menu-button.hidden {
      display: none;
    }

    .user-avatar-initial {
      pointer-events: none;
    }

    .user-avatar-img {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      object-fit: cover;
      pointer-events: none;
    }

    .user-avatar-img.hidden {
      display: none;
    }

    .user-menu {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--color-paper-white);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 9999;
      pointer-events: auto;
    }

    .user-menu.hidden {
      display: none;
    }

    .user-menu-email {
      color: var(--text-muted);
      font-size: 13px;
      text-align: center;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-menu-actions {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .user-menu-item {
      padding: 10px 24px;
      background: var(--color-eager-green);
      border: 2px solid var(--color-eager-green);
      border-radius: 12px;
      color: var(--color-paper-white);
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      pointer-events: auto;
    }

    .user-menu-item:hover {
      filter: brightness(1.07);
    }

    .user-menu-cancel-btn {
      padding: 10px 24px;
      background: transparent;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      color: var(--color-spark-blue);
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      pointer-events: auto;
    }

    .user-menu-cancel-btn:hover {
      border-color: var(--color-spark-blue);
    }

    /* ==================== 精简模式（上中下三层并为两层） ==================== */

    #edge-tts-widget.minimized {
      width: 300px;
    }

    /* 隐藏头部、音色面板、文本框、错误条 */
    #edge-tts-widget.minimized .tts-widget-header,
    #edge-tts-widget.minimized #tts-widget-content .voice-selector,
    #edge-tts-widget.minimized .text-display,
    #edge-tts-widget.minimized .error-message,
    #edge-tts-widget.minimized #apikey-container {
      display: none !important;
    }

    /* 精简态宽度只够传输组 + 恢复按钮：停止清空收起（停止仍保留） */
    #edge-tts-widget.minimized #clear-btn {
      display: none !important;
    }

    #edge-tts-widget.minimized .tts-widget-content {
      padding: 12px;
      gap: 8px;
    }

    /* 恢复按钮挪进播放控制行后靠右，与播放按钮分组 */
    #edge-tts-widget.minimized .player-controls .tts-widget-minimize {
      margin-left: auto;
    }

    /* ==================== 未配置 API Key 的精简形态 ==================== */

    #edge-tts-widget.auth-mode {
      width: 320px !important;
    }

    #edge-tts-widget.auth-mode #tts-widget-content .voice-selector,
    #edge-tts-widget.auth-mode #player-container,
    #edge-tts-widget.auth-mode .player-controls,
    #edge-tts-widget.auth-mode .status-container,
    #edge-tts-widget.auth-mode #error-message,
    #edge-tts-widget.auth-mode .tts-widget-minimize,
    #edge-tts-widget.auth-mode .tts-widget-theme-toggle {
      display: none !important;
    }

    /* ==================== 暗色变体（Night Ink 底，默认不启用） ==================== */

    #edge-tts-widget.dark-theme {
      --surface: #000437;
      --surface-card: rgba(255, 255, 255, 0.07);
      --text-strong: #ffffff;
      --text-body: #afafaf;
      --text-muted: #afafaf;
      --option-hover: rgba(215, 255, 184, 0.18);
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .tts-widget-header {
      background: rgba(255, 255, 255, 0.06);
      border-bottom-color: var(--color-eager-green);
    }

    #edge-tts-widget.dark-theme .header-app-name {
      color: var(--color-fresh-leaf);
    }

    #edge-tts-widget.dark-theme .tts-widget-btn {
      border-color: rgba(255, 255, 255, 0.55);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .tts-widget-btn svg {
      fill: #ffffff;
    }

    #edge-tts-widget.dark-theme .tts-widget-btn:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .tts-widget-btn:hover svg {
      fill: #ffffff;
    }

    #edge-tts-widget.dark-theme .language-button,
    #edge-tts-widget.dark-theme .language-strip-flag {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.45);
    }

    #edge-tts-widget.dark-theme .language-strip {
      background: #000437;
    }

    #edge-tts-widget.dark-theme #voice-search,
    #edge-tts-widget.dark-theme .speed-select,
    #edge-tts-widget.dark-theme .language-select,
    #edge-tts-widget.dark-theme .text-content,
    #edge-tts-widget.dark-theme .apikey-input {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme #voice-search::placeholder {
      color: rgba(175, 175, 175, 0.7);
    }

    #edge-tts-widget.dark-theme .dropdown-list {
      background: #0a0a45;
      border-color: rgba(255, 255, 255, 0.45);
    }

    #edge-tts-widget.dark-theme .voice-option {
      border-bottom-color: rgba(255, 255, 255, 0.14);
    }

    #edge-tts-widget.dark-theme .voice-option-name {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .voice-option-details {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-loading {
      background: rgba(215, 255, 184, 0.14);
      color: #d7ffb8;
    }

    #edge-tts-widget.dark-theme .text-content .highlight {
      background: rgba(88, 204, 2, 0.32);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .text-content:empty::before {
      color: rgba(175, 175, 175, 0.6);
    }

    #edge-tts-widget.dark-theme .btn-secondary {
      color: var(--color-spark-blue);
    }

    #edge-tts-widget.dark-theme .btn-secondary:hover:not(:disabled) {
      background: rgba(28, 176, 246, 0.16);
    }

    #edge-tts-widget.dark-theme .btn-success {
      color: #a5ed6e;
    }

    #edge-tts-widget.dark-theme .btn-success:hover:not(:disabled) {
      background: rgba(88, 204, 2, 0.16);
    }

    #edge-tts-widget.dark-theme .btn-danger {
      border-color: rgba(255, 255, 255, 0.55);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .btn-danger:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
    }

    #edge-tts-widget.dark-theme .error-message {
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.55);
    }

    #edge-tts-widget.dark-theme .error-message.warning {
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.55);
    }

    #edge-tts-widget.dark-theme .error-close-btn {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .user-menu {
      background: #000437;
    }

    #edge-tts-widget.dark-theme .status-text {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-panel-toggle {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-panel-toggle:hover {
      background: rgba(215, 255, 184, 0.16);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .voice-search-clear {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-search-clear:hover {
      background: rgba(215, 255, 184, 0.16);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .checkbox-label {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .checkbox-label input[type='checkbox'] {
      background: rgba(255, 255, 255, 0.08);
    }

    #edge-tts-widget.dark-theme .apikey-hint-text {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .user-menu-email {
      color: #afafaf;
    }

    #edge-tts-widget.dragging {
      opacity: 0.85;
    }

    /* ==================== Tooltip ==================== */

    .tts-tooltip {
      position: absolute;
      background: var(--color-night-ink);
      color: var(--color-paper-white);
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 13px;
      pointer-events: none;
      z-index: 10000001;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .tts-tooltip.show {
      opacity: 1;
    }

    #edge-tts-widget.dark-theme .tts-tooltip {
      background: rgba(255, 255, 255, 0.94);
      color: #000437;
    }

    /* ==================== 动画 ==================== */

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  `;
