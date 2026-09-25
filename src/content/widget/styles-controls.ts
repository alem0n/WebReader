/**
 * 悬浮窗样式 · API Key 提示 / 文本显示 / 播放控制按钮 / 状态与错误 / 滚动条。
 *
 * 从 widget/styles.ts 按分区拆出：
 * 各段由 styles.ts 按原顺序聚合成单一字符串注入 Shadow DOM，级联顺序与拆分前完全一致。
 */
export const WIDGET_STYLES_CONTROLS = `/* ==================== API Key 提示界面 ==================== */

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

    `;
