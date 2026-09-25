/**
 * 悬浮窗样式 · 音色面板：搜索框 / 语速 / 开关复选框。
 *
 * 从 widget/styles.ts 按分区拆出：
 * 各段由 styles.ts 按原顺序聚合成单一字符串注入 Shadow DOM，级联顺序与拆分前完全一致。
 */
export const WIDGET_STYLES_PANEL = `/* ==================== 音色 / 语速 / 开关 ==================== */

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

    `;
