/** 加载指定 locale 的语言文件（找不到时回退英文） */
import type { I18nMessagesResponse } from '../shared/types';
import { logger } from './log';

export async function loadI18nMessagesForLocale(locale: string, sendResponse: (response: I18nMessagesResponse) => void): Promise<void> {
  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) {
      // Fallback to English if locale file not found
      if (locale !== 'en') {
        return loadI18nMessagesForLocale('en', sendResponse);
      }
      throw new Error('Failed to load messages');
    }
    const data = await response.json();
    // Extract messages from the nested structure
    const messages: Record<string, string> = {};
    for (const key in data) {
      messages[key] = data[key].message;
    }
    sendResponse({ success: true, messages });
  } catch (error) {
    logger.error('Error loading i18n messages:', error);
    // Fallback to English
    if (locale !== 'en') {
      return loadI18nMessagesForLocale('en', sendResponse);
    }
    sendResponse({ success: false, error: (error as Error).message, messages: {} });
  }
}
