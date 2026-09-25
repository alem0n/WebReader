/**
 * 悬浮窗初始化 —— 认证界面与已移除登录的 no-op 绑定。
 *
 * widget 内仅作提示：无 Key 且无本地音色时引导到 Key 界面；有 Key 或本地音色
 * 可用时直接进入播放器（开箱即用）。登录体系已删除，用户菜单按钮保留但为空操作。
 */
import { state } from '../state';
import { logger } from '../log';
import * as localTts from '../../shared/local-tts';
import { getWidget } from '../widget';
import {
  showPlayerScreenInWidget,
  showApiKeyScreenInWidget,
  checkApiKeyStatusForWidget,
  setupApiKeyUIInWidget,
  updateStatusText,
} from '../ui';

/** 已移除的登录 / 用户菜单：按钮保留但不再执行任何操作 */
export function bindUserMenuNoOps(): void {
  if (state.loginBtn) {
    // 登录已移除：登录按钮不再执行任何操作
    state.loginBtn.addEventListener('click', () => {
      /* no-op */
    });
  }

  if (state.userMenuButton) {
    state.userMenuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.userMenu) return;
      // Обновляем email перед показом
      if (state.userMenuEmailEl) {
        state.userMenuEmailEl.textContent = state.currentUserEmail || '';
      }
      state.userMenu.classList.remove('hidden');
    });
  }

  if (state.userMenuCancel) {
    state.userMenuCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (state.userMenu) state.userMenu.classList.add('hidden');
    });
  }

  if (state.userMenu) {
    state.userMenu.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  if (state.userLogoutBtn) {
    // 登录已移除：登出按钮不再执行任何操作
    state.userLogoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  }
}

/**
 * 检查 API Key 状态并切换到对应界面。
 *
 * 有 Key，或本地音色可用（未配置 Key 也能朗读，开箱即用）→ 播放器；
 * 既无 Key 又无本地音色 → 只能引导到主界面配置 Key。
 */
export async function initAuthScreen(): Promise<void> {
  setupApiKeyUIInWidget();
  const keyStatus = await checkApiKeyStatusForWidget();
  const hasKey = !!(keyStatus && (keyStatus as any).hasKey);
  if (!hasKey && !localTts.canSpeak()) {
    logger.warn('No API Key configured and local TTS unavailable, showing API key screen');
    showApiKeyScreenInWidget();
  } else {
    showPlayerScreenInWidget();
    if (!hasKey) {
      updateStatusText('未配置 MiMo API Key，当前使用本地音色；可在主界面填写 Key 启用 MiMo 音色');
    }
  }
}

/** 暴露给外部的「显示 Key 界面」入口（兼容旧调用方） */
export function installWidgetShowLoginBridge(): void {
  window.edgeTTSShowWidgetLogin = () => {
    const el = getWidget();
    if (el) {
      el.style.display = 'block';
    }
    // 无 API Key 时显示填写界面
    showApiKeyScreenInWidget();
  };

  // 登录已移除：无需在窗口重新聚焦时刷新认证状态
  window.addEventListener('focus', () => {
    // no-op
  });
  document.addEventListener('visibilitychange', () => {
    // no-op
  });
}
