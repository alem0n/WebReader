/**
 * 音色列表加载：缓存读写 + 后台预置音色拉取 + 重试。
 *
 * 从 voices.ts 拆出。音色来自 background 的本地
 * 预置表（无网络请求），结果缓存 24 小时；命中缓存时后台静默刷新，未命中时
 * 同步加载并重试。加载完成后恢复用户已选音色 / 语速，未手选时按界面语言
 * 派生默认音色。
 */
import { state } from '../state';
import { sleep } from '../utils';
import { hideError, showError, updateButtonStates, updateClearButton, updatePlayButtonState } from '../ui';
import { loadSettings, syncSpeedSelectFromStored } from '../settings';
import { createContentLogger } from '../log';
import { formatVoiceName } from './format';
import { filterVoices, selectVoice } from './dropdown';
import { ensureVoiceSelected } from './voice-selection';
import { resolveRestoredVoice } from '../../shared/voice-restore';
import type { ExtensionSettings } from '../../shared/types';

const logger = createContentLogger('voices');

const VOICES_CACHE_KEY = 'tts-voices-cache';
const VOICES_CACHE_TIMESTAMP_KEY = 'tts-voices-cache-timestamp';
const VOICES_CACHE_DURATION = 24 * 60 * 60 * 1000;

export async function clearVoicesCache(reason = 'unknown') {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove([VOICES_CACHE_KEY, VOICES_CACHE_TIMESTAMP_KEY], () => resolve());
      });
    } else {
      localStorage.removeItem(VOICES_CACHE_KEY);
      localStorage.removeItem(VOICES_CACHE_TIMESTAMP_KEY);
    }
    logger.debug(`Cleared voice cache (reason=${reason})`);
  } catch (error) {
    logger.warn(`Failed to clear voice cache (reason=${reason}):`, error);
  }
}

async function loadVoicesFromServerWithRetry(options = {}) {
  const silent = !!(options as any).silent;
  const authStage = (options as any).authStage || 'unknown';
  const maxAttempts = (options as any).maxAttempts || 3;
  const retryDelaysMs = [300, 800, 1500];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await loadVoicesFromServer(silent, { attempt, authStage });
      return;
    } catch (error) {
      lastError = error;
      const message = error && (error as any).message ? (error as any).message : String(error);
      const isRetryable = /Invalid API key|Failed to fetch|Network|No response|HTTP 401|timeout/i.test(message);
      logger.warn(`attempt=${attempt}/${maxAttempts} authStage=${authStage} silent=${silent} failed:`, message);
      if (!isRetryable || attempt === maxAttempts) break;
      await sleep(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)]);
    }
  }

  throw lastError || new Error('Failed to load voices');
}

/**
 * 恢复用户手选音色：存储中**显式标记为手选**且在当前目录内则沿用，
 * 否则按界面语言派生默认音色（不落盘，跟随界面语言）。
 * 返回存储设置供调用方继续恢复语速等其余项。
 *
 * 判据见 shared/voice-restore：旧版自动检测落盘的 selectedVoice 没有手选标志，
 * 一律按界面语言重新派生，避免中文界面恢复英文音色（自愈迁移）。
 */
async function restoreVoiceSelection(): Promise<Partial<ExtensionSettings>> {
  const settings = await loadSettings();
  const savedVoice = resolveRestoredVoice(settings, state.allVoices);
  if (savedVoice) {
    selectVoice(savedVoice);
    state.voiceSearchInput!.value = formatVoiceName(savedVoice);
    updateClearButton();
    logger.debug('Restored saved voice:', savedVoice.name);
  } else {
    ensureVoiceSelected();
    logger.debug('No saved voice in list, using interface-language default');
  }
  return settings;
}

export async function loadVoices(options = {}) {
  const forceRefresh = !!(options as any).forceRefresh;
  const authStage = (options as any).authStage || 'unknown';
  try {
    state.voiceSearchInput!.disabled = true;
    state.voiceLoadingIndicator!.classList.remove('hidden');
    if (typeof updateClearButton === 'function') updateClearButton();

    // Disable all buttons except Clear while loading voices
    updateButtonStates();

    hideError();

    if (forceRefresh) {
      await clearVoicesCache('force-refresh');
      await loadVoicesFromServerWithRetry({ silent: false, authStage, maxAttempts: 3 });
      return;
    }

    let cachedVoices = null;
    let cacheTimestamp = null;

    // Try to load from cache
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const cacheData = await new Promise((resolve) => {
        chrome.storage.local.get([VOICES_CACHE_KEY, VOICES_CACHE_TIMESTAMP_KEY], (data) => {
          resolve(data);
        });
      });
      cachedVoices = (cacheData as any)[VOICES_CACHE_KEY];
      cacheTimestamp = (cacheData as any)[VOICES_CACHE_TIMESTAMP_KEY];
    } else {
      const cachedVoicesStr = localStorage.getItem(VOICES_CACHE_KEY);
      const cacheTimestampStr = localStorage.getItem(VOICES_CACHE_TIMESTAMP_KEY);
      if (cachedVoicesStr) {
        try {
          cachedVoices = JSON.parse(cachedVoicesStr);
          cacheTimestamp = cacheTimestampStr ? parseInt(cacheTimestampStr, 10) : null;
        } catch (e) {
          logger.warn('Failed to parse cached voices:', e);
        }
      }
    }

    // Check if cache is valid (exists and not expired)
    const now = Date.now();
    const isCacheValid =
      cachedVoices &&
      Array.isArray(cachedVoices) &&
      cachedVoices.length > 0 &&
      cacheTimestamp &&
      now - cacheTimestamp < VOICES_CACHE_DURATION;

    if (isCacheValid) {
      logger.debug(`Using cached voices: ${cachedVoices.length} voices (authStage=${authStage})`);
      state.allVoices = cachedVoices;
      state.filteredVoices = [...state.allVoices];

      state.voiceSearchInput!.disabled = false;
      state.voiceLoadingIndicator!.classList.add('hidden');
      updateButtonStates();
      filterVoices('');

      // 恢复用户手选音色，或按界面语言派生默认音色（落实为单一来源 selectedVoice）
      const settings = await restoreVoiceSelection();

      if (state.speedSelect) {
        (state as any).playbackSpeed = syncSpeedSelectFromStored(state.speedSelect, settings.playbackSpeed);
      }

      updatePlayButtonState();
      setTimeout(() => {
        updatePlayButtonState();
      }, 100);

      // Load fresh data in background to update cache
      loadVoicesFromServerWithRetry({ silent: true, authStage: `${authStage}-cache-refresh`, maxAttempts: 3 }).catch((error) => {
        logger.warn('Background refresh failed after retries:', error);
      });
      return;
    }

    // Cache is invalid or doesn't exist, load from server
    await loadVoicesFromServerWithRetry({ silent: false, authStage, maxAttempts: 3 });
  } catch (error: any) {
    state.voiceSearchInput!.disabled = false;
    state.voiceLoadingIndicator!.classList.add('hidden');
    showError(`Failed to load voices: ${error.message}`);
    logger.error('Error loading voices:', error);
    updateButtonStates();
  }
}

async function loadVoicesFromServer(silent = false, options = {}) {
  const attempt = (options as any).attempt || 1;
  const authStage = (options as any).authStage || 'unknown';
  try {
    if (!silent) {
      state.voiceSearchInput!.disabled = true;
      state.voiceLoadingIndicator!.classList.remove('hidden');
      if (typeof updateClearButton === 'function') updateClearButton();
      updateButtonStates();
      hideError();
    }

    logger.debug(`Loading MiMo preset voices (attempt=${attempt}, authStage=${authStage}, silent=${silent})`);

    // 通过 background 获取 MiMo 预置音色（本地列表，无网络请求）
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'getPresetVoices',
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error('No response from background script'));
            return;
          }
          resolve(response);
        }
      );
    });

    if (!(response as any).success) {
      throw new Error((response as any).error || 'Failed to load preset voices');
    }

    const voices = (response as any).voices || [];

    // Save to cache
    const now = Date.now();

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        [VOICES_CACHE_KEY]: voices,
        [VOICES_CACHE_TIMESTAMP_KEY]: now,
      });
    } else {
      localStorage.setItem(VOICES_CACHE_KEY, JSON.stringify(voices));
      localStorage.setItem(VOICES_CACHE_TIMESTAMP_KEY, now.toString());
    }

    logger.debug(`Voices loaded and cached: ${voices.length} (attempt=${attempt}, authStage=${authStage}, silent=${silent})`);

    if (!silent) {
      state.allVoices = voices;
      state.filteredVoices = [...state.allVoices];

      state.filteredVoices.sort((a, b) => {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
      });

      state.voiceSearchInput!.disabled = false;
      state.voiceLoadingIndicator!.classList.add('hidden');

      // Re-enable buttons now that voices are loaded
      updateButtonStates();

      filterVoices('');

      // 恢复用户手选音色，或按界面语言派生默认音色（落实为单一来源 selectedVoice）
      const settings = await restoreVoiceSelection();

      if (state.speedSelect) {
        (state as any).playbackSpeed = syncSpeedSelectFromStored(state.speedSelect, settings.playbackSpeed);
      }

      // Update button state
      updatePlayButtonState();

      // Give a moment for UI to update, then check again
      setTimeout(() => {
        updatePlayButtonState();
      }, 100);
    }
  } catch (error: any) {
    if (!silent) {
      state.voiceSearchInput!.disabled = false;
      state.voiceLoadingIndicator!.classList.add('hidden');
      showError(`Failed to load voices: ${error.message}`);
      logger.error(`Error loading voices (attempt=${attempt}, authStage=${authStage}):`, error);
      updateButtonStates();
    } else {
      logger.warn(`Background refresh failed (attempt=${attempt}, authStage=${authStage}):`, error);
    }
    throw error;
  }
}
