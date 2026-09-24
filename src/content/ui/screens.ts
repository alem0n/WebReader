/** 悬浮窗屏幕切换：播放界面 / API Key 界面，以及 Key 状态查询 */
import { getWidget } from '../widget';
import { state } from '../state';
import { createContentLogger } from '../log';

const logger = createContentLogger('ui/screens');

export function showPlayerScreenInWidget() {
  if (state.authContainer) state.authContainer.style.display = 'none';
  if (state.playerContainer) state.playerContainer.style.display = 'block';
  if (state.apiKeyContainer) state.apiKeyContainer.style.display = 'none';
  if (state.authCheckInterval) {
    clearInterval(state.authCheckInterval);
    state.authCheckInterval = null;
  }
  getWidget()?.classList.remove('auth-mode');
}

export function showApiKeyScreenInWidget() {
  if (state.playerContainer) state.playerContainer.style.display = 'none';
  if (state.apiKeyContainer) state.apiKeyContainer.style.display = 'block';
  getWidget()?.classList.add('auth-mode');
}

export async function checkApiKeyStatusForWidget() {
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkApiKeyStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
    return result || { hasKey: false };
  } catch (error) {
    logger.error('Failed to check API key status:', error);
    return { hasKey: false };
  }
}

export function setupApiKeyUIInWidget() {
  // 配置统一在插件主界面完成，悬浮窗内无需绑定保存逻辑
}
