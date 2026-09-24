/**
 * 悬浮窗样式 · 基础：根变量、悬浮窗布局、顶部头条、语言切换、内容区。
 *
 * 从 widget/styles.ts 按分区拆出（docs/tech-debt.md TD-001）：
 * 各段由 styles.ts 按原顺序聚合成单一字符串注入 Shadow DOM，级联顺序与拆分前完全一致。
 */
export const WIDGET_STYLES_BASE = `
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

    `;
