/** API Key 读取 / 检查 / 保存（chrome.storage.local，界面填写优先） */
import { MIMO_API_KEY, MIMO_API_KEY_STORAGE } from '../shared/constants';
import type { ApiKeyStatusResponse, SaveApiKeyResponse } from '../shared/types';
import { logger } from './log';

/** 获取当前生效的 API Key：优先 chrome.storage.local（界面填写），其次硬编码后备 */
export async function getApiKey(): Promise<string> {
  try {
    const data = await chrome.storage.local.get(MIMO_API_KEY_STORAGE);
    const stored = data && data[MIMO_API_KEY_STORAGE];
    if (stored && String(stored).trim()) {
      return String(stored).trim();
    }
  } catch (e) {
    logger.warn('Failed to read stored API key:', e);
  }
  return MIMO_API_KEY && String(MIMO_API_KEY).trim() ? String(MIMO_API_KEY).trim() : '';
}

/** 检查 API Key 是否已配置 */
export async function checkApiKeyStatus(sendResponse: (response: ApiKeyStatusResponse) => void): Promise<void> {
  try {
    const key = await getApiKey();
    sendResponse({ success: true, hasKey: !!key, maskedKey: key ? maskKey(key) : null });
  } catch (error) {
    logger.error('checkApiKeyStatus error:', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

/** 保存 API Key 到 chrome.storage.local */
export async function saveApiKey(apiKey: string, sendResponse: (response: SaveApiKeyResponse) => void): Promise<void> {
  try {
    const key = apiKey && String(apiKey).trim();
    if (!key) {
      sendResponse({ success: false, error: 'API Key 不能为空' });
      return;
    }
    await chrome.storage.local.set({ [MIMO_API_KEY_STORAGE]: key });
    logger.info('API Key saved');
    sendResponse({ success: true, maskedKey: maskKey(key) });
  } catch (error) {
    logger.error('saveApiKey error:', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

/** 脱敏展示 API Key */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
