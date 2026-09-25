/**
 * 悬浮窗样式 · 用户菜单、精简模式、暗色变体（Night Ink）、Tooltip、动画。
 *
 * 从 widget/styles.ts 按分区拆出（docs/tech-debt.md TD-001）：
 * 各段由 styles.ts 按原顺序聚合成单一字符串注入 Shadow DOM，级联顺序与拆分前完全一致。
 */
export const WIDGET_STYLES_THEME = `/* ==================== 用户菜单（覆盖层） ==================== */

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
