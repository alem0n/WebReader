/**
 * ui —— 悬浮窗界面行为入口（原 `ui.ts`）。
 *
 * 按界面行为拆分（import 路径 './ui' 解析到本 index，形状不变）：
 * screens（屏幕切换）/ drag（拖拽）/ time-progress（时间进度）/
 * text-highlight（文本框逐句高亮）/ controls（控件状态、状态文本与错误提示）/
 * tooltips（禁用元素的悬停提示）。
 *
 * 网页原位的逐句高亮（不覆盖原文）不在这里，见 reading-overlay.ts。
 */
export { showPlayerScreenInWidget, showApiKeyScreenInWidget, checkApiKeyStatusForWidget, setupApiKeyUIInWidget } from './screens';
export { dragStart, drag, dragEnd } from './drag';
export { estimateTotalDuration, updateTimeProgress } from './time-progress';
export { highlightFirstSentenceIfNeeded, updateTextHighlight, escapeHtml } from './text-highlight';
export {
  updateButtonStates,
  updatePlayButtonState,
  updateClearButton,
  setVoicePanelCollapsed,
  disableButtons,
  updateStatusText,
  resetPlayerState,
  showLoading,
  showError,
  hideError,
} from './controls';
export { setupDisabledTooltips } from './tooltips';
