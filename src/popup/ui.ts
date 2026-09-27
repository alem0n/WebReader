/** UI state: error feedback. 加载/状态文本反馈由 quick-actions 直操 status-text，本模块只留错误反馈。 */
import { errorMessage } from './state';

// Show error message
export function showError(message: any) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

// Hide error message
export function hideError() {
  errorMessage.classList.add('hidden');
}
