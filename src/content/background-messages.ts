/**
 * background → content 消息监听（模块级，注册一次）。
 *
 * 消息驱动悬浮窗显隐、选中朗读、整页朗读；popup 配好 Key 或切换 provider 后
 * 也会广播到当前标签页，由此处接续音色目录与界面状态。
 */
import { state } from './state';
import { logger } from './log';
import { toggleWidget } from './selection';
import { playSelectedText } from './text-input';
import { playEntirePage } from './player';
import { showPlayerScreenInWidget } from './ui';
import { loadVoices, clearVoicesCache } from './voices';

/**
 * 收到「API Key 已保存」广播时：
 * 1. 若悬浮窗正停在 Key 界面，切回播放器；
 * 2. 若之前点 FAB 暂存了整页正文，自动填入并开始朗读。
 *
 * 修复动线 A1/A2：用户首次使用时「点 FAB → 弹窗要求配 Key → popup 配好 →
 * 回到页面」能无缝接上，无需再点一次 FAB。
 */
function onApiKeySaved(): void {
  const wasKeyScreen = state.apiKeyContainer && state.apiKeyContainer.style.display !== 'none';

  if (wasKeyScreen) {
    showPlayerScreenInWidget();
  }

  const pending = state.pendingPageText;
  if (pending) {
    state.pendingPageText = null;
    // 播放器界面已切回，走正常填入+自动播放流程
    playEntirePage();
  }
}

/**
 * 后端配置变更：provider 切换或中转地址变更后，旧 provider 的音色已失效。
 * 清音色缓存并静默重载（不抢当前朗读，下次开始朗读即用新 provider）。
 */
async function onRelayConfigSaved(): Promise<void> {
  try {
    await clearVoicesCache('relay-config-saved');
    await loadVoices({ forceRefresh: true, authStage: 'relay-config-saved' });
  } catch (e) {
    logger.warn('onRelayConfigSaved reload voices failed:', e);
  }
}

/** 注册 background 消息监听（content script 加载时调用一次） */
export function registerBackgroundMessages(): void {
  chrome.runtime.onMessage.addListener((request: any, _sender: chrome.runtime.MessageSender, _sendResponse: (response?: any) => void) => {
    if (request.action === 'toggle') {
      toggleWidget();
    } else if (request.action === 'playSelectedText') {
      playSelectedText(request.text as string);
    } else if (request.action === 'readEntirePage') {
      playEntirePage();
    } else if (request.action === 'apiKeySaved') {
      // popup 配好 Key 后，页面悬浮窗从 Key 界面切回播放器；
      // 若之前点 FAB 时暂存了整页正文，自动填入并开始朗读（动线 A1/A2 修复）
      onApiKeySaved();
    } else if (request.action === 'relayConfigSaved') {
      // 后端配置变更（provider 切换 / 地址变更）：音色目录与 provider 已变，
      // 清掉旧音色缓存并重载，避免悬浮窗继续用旧 provider 的音色
      onRelayConfigSaved();
    }
  });
}
