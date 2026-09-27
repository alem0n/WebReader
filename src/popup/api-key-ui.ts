/** API Key 配置与保存（MiMo 引擎配置，面板外壳已并入 config-ui 统一管理） */
import { state, speedSelect, errorMessage } from './state';
import { sendToBackground } from '../shared/messaging';
import type { ApiKeyStatusResponse, SaveApiKeyResponse, ToggleWidgetResponse } from '../shared/types';
import { loadStoredSettings } from './settings';
import { loadVoices } from './voices';
import { setupEventListeners, setupLanguageToggle } from './index';
import { sleep } from './utils';
import { logger } from './log';
import { setConfigPanelOpen } from './config-ui';

// ---------- 错误提示 ----------

function showApiKeyError(msg: string): void {
  if (errorMessage) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
  }
}

function hideApiKeyError(): void {
  if (errorMessage) {
    errorMessage.classList.add('hidden');
  }
}

// ---------- API Key 状态 ----------

export async function checkApiKeyStatus(): Promise<ApiKeyStatusResponse> {
  try {
    const response = await sendToBackground<ApiKeyStatusResponse>({ action: 'checkApiKeyStatus' });
    return response || { success: false, hasKey: false };
  } catch (error) {
    logger.error('Failed to check API key status:', error);
    return { success: false, hasKey: false };
  }
}

export function saveApiKey(apiKey: string): Promise<SaveApiKeyResponse> {
  return sendToBackground<SaveApiKeyResponse>({ action: 'saveApiKey', apiKey });
}

// ---------- 首次配置成功后的音色加载（带重试） ----------

export async function loadVoicesWithRetry(
  options: {
    authStage?: string;
    maxAttempts?: number;
  } = {}
): Promise<void> {
  const authStage = options.authStage || 'unknown';
  const maxAttempts = options.maxAttempts || 3;
  const retryDelaysMs = [300, 800, 1500];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await loadVoices({ attempt, authStage });
      return;
    } catch (error) {
      lastError = error as Error;
      const message = error && (error as Error).message ? (error as Error).message : String(error);
      const isRetryable = /Invalid API key|Failed to fetch|Network|No response|HTTP 401|timeout/i.test(message);
      logger.warn(`attempt=${attempt}/${maxAttempts} authStage=${authStage} failed:`, message);

      if (!isRetryable || attempt === maxAttempts) {
        break;
      }

      await sleep(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)]);
    }
  }

  throw lastError || new Error('Failed to load voices');
}

// ---------- 事件绑定 ----------

function setupApiKeyUI(): void {
  const saveBtn = document.getElementById('apikey-save-btn') as HTMLButtonElement | null;
  const input = document.getElementById('apikey-input') as HTMLInputElement | null;
  const toggleBtn = document.getElementById('apikey-toggle-visibility');

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const key = input ? input.value.trim() : '';
      if (!key) {
        showApiKeyError('请输入 API Key');
        return;
      }
      saveBtn.disabled = true;
      try {
        const res = await saveApiKey(key);
        if (res && res.success) {
          hideApiKeyError();
          state.isAuthenticated = true;

          // 未初始化过（首次配置）：保存后原地加载音色与已存设置，无需切屏
          if (!state.playerInitialized) {
            await initPlayerAfterKeySave();
          } else {
            // 修改 Key 场景：就地收起面板，新 Key 立即生效
            const hint = document.getElementById('apikey-hint-text');
            if (hint) hint.textContent = '✅ API Key 已更新，立即生效';
            await sleep(600);
            if (hint) hint.textContent = '修改 MiMo API Key，保存后立即生效。';
          }
          if (input) input.value = '';
          setConfigPanelOpen(false);
        } else {
          showApiKeyError((res && res.error) || '保存失败，请重试');
          saveBtn.disabled = false;
        }
      } catch (e) {
        logger.error('Save error:', e);
        showApiKeyError('保存失败：' + ((e as Error).message || '未知错误'));
        saveBtn.disabled = false;
      }
    });
  }

  if (toggleBtn && input) {
    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && saveBtn) {
        saveBtn.click();
      }
    });
  }
}

// 首次配置成功后：原地加载音色与已存设置（不再切换界面，用户停留在同一屏）
async function initPlayerAfterKeySave(): Promise<void> {
  state.isAuthenticated = true;

  if (speedSelect) speedSelect.value = '1.0';

  await loadStoredSettings();

  setupEventListeners();
  await loadVoicesWithRetry({ authStage: 'post-auth-initial', maxAttempts: 3 });
  state.playerInitialized = true;
}

import { setupConfigUI, refreshRelayStatus } from './config-ui';
import { setupQuickActions } from './quick-actions';
import { setupThemeToggle } from './theme';

// ---------- 网页悬浮窗开关 ----------

function setupWidgetToggleUI(): void {
  const btn = document.getElementById('widget-toggle-btn') as HTMLButtonElement | null;
  const statusEl = document.getElementById('widget-toggle-status');
  if (!btn) return;

  const showStatus = (msg: string, type?: string): void => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'widget-toggle-status' + (type ? ' ' + type : '');
    clearTimeout((showStatus as any)._timer);
    (showStatus as any)._timer = setTimeout(() => {
      statusEl.classList.add('hidden');
    }, 3000);
  };

  btn.addEventListener('click', () => {
    btn.disabled = true;
    chrome.runtime.sendMessage({ action: 'toggleWidgetOnActiveTab' }, (response: ToggleWidgetResponse) => {
      btn.disabled = false;
      if (chrome.runtime.lastError) {
        showStatus('无法连接到后台：' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (response && response.success) {
        showStatus('已切换当前网页的悬浮窗', 'success');
      } else {
        showStatus((response && response.error) || '操作失败', 'error');
      }
    });
  });
}

// DOM ready 后绑定配置面板（统一入口）与悬浮窗开关事件
// （index.ts 的初始化在未配置时会提前 return，这些绑定必须独立于它，保证面板按钮始终可用）
document.addEventListener('DOMContentLoaded', () => {
  setupApiKeyUI();
  setupConfigUI();
  setupWidgetToggleUI();
  setupQuickActions();
  // 界面语言与引擎配置无关，必须在未配置时也可用（index.ts 未配置时会提前 return）
  setupLanguageToggle();
  // 主题与引擎配置无关，切换后写入共享存储，已打开的悬浮窗即时跟随
  void setupThemeToggle();
  // 后端配置回填与状态展示（不依赖 Key 是否配置）
  void refreshRelayStatus();
});
