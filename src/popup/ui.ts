/** UI state: status text, loading/error feedback. 播放控制已随播放器界面移除。 */
import { state, statusText, errorMessage } from './state';
import { i18n } from './i18n';

// Update status text (always in the same place, replaces loading text)
export function updateStatusText(text: string) {
  if (statusText) {
    statusText.textContent = text || i18n('ready');
  }
}

// Show/hide loading indicator (uses status-text, no separate element)
export function showLoading(show: any, message: any = null) {
  state.isLoading = show;
  if (show) {
    updateStatusText(message || i18n('loading_voices'));
  }
}

// Show error message
export function showError(message: any) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

// Hide error message
export function hideError() {
  errorMessage.classList.add('hidden');
}
