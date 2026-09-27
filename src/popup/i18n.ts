/** 界面语言（i18n）：消息加载、切换与应用 */
import { state, voiceSearchInput, voiceLoadingIndicator, voicePanelToggle, voiceSelectorEl } from './state';
import type { I18nMessagesResponse } from '../shared/types';
import { logger } from './log';

// Load i18n messages for a specific locale via background script
export function loadI18nMessages(locale: string): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'loadI18nMessages', locale: locale }, (response: I18nMessagesResponse) => {
      if (chrome.runtime.lastError) {
        logger.error('Error loading i18n messages:', chrome.runtime.lastError);
        // Fallback to English
        if (locale !== 'en') {
          loadI18nMessages('en').then(resolve);
          return;
        }
        state.i18nMessages = {};
        resolve({});
        return;
      }

      if (response && response.success) {
        state.i18nMessages = response.messages as Record<string, string>;
        logger.debug('Loaded', Object.keys(response.messages as Record<string, string>).length, 'messages for locale:', locale);
        resolve(response.messages as Record<string, string>);
      } else {
        logger.error('Error loading i18n messages:', response?.error);
        // Fallback to English
        if (locale !== 'en') {
          loadI18nMessages('en').then(resolve);
        } else {
          state.i18nMessages = {};
          resolve({});
        }
      }
    });
  });
}

// Helper function to get i18n message
export function i18n(key: string): string {
  if (state.i18nMessages && state.i18nMessages[key]) {
    return state.i18nMessages[key];
  }
  // Fallback to chrome.i18n if messages not loaded yet
  return chrome.i18n.getMessage(key) || key;
}

// Load and apply interface language
export function loadInterfaceLanguage(): Promise<string> {
  return new Promise((resolve) => {
    let locale = 'en';
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['interfaceLanguage'], (data) => {
        locale = data.interfaceLanguage || 'en';
        loadI18nMessages(locale).then(() => {
          state.interfaceLanguage = locale;
          applyInterfaceLanguage(state.interfaceLanguage);
          resolve(state.interfaceLanguage);
        });
      });
    } else {
      const stored = localStorage.getItem('interfaceLanguage');
      locale = stored || 'en';
      // Load i18n messages for the selected language
      loadI18nMessages(locale).then(() => {
        state.interfaceLanguage = locale;
        applyInterfaceLanguage(state.interfaceLanguage);
        resolve(state.interfaceLanguage);
      });
    }
  });
}

// Save interface language
export function saveInterfaceLanguage(locale: string): void {
  state.interfaceLanguage = locale;
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ interfaceLanguage: locale });
  } else {
    localStorage.setItem('interfaceLanguage', locale);
  }
}

// Apply interface language by loading new messages and updating UI
export async function changeInterfaceLanguage(locale: string): Promise<void> {
  saveInterfaceLanguage(locale);
  // Load new i18n messages
  await loadI18nMessages(locale);
  // Apply the new language to all elements
  applyInterfaceLanguage(locale);
}

// Apply interface language to all elements (called on load)
export function applyInterfaceLanguage(locale: string): void {
  // Update document language
  document.documentElement.lang = locale;

  // Update title
  document.title = i18n('app_title');

  // Update placeholder for voice search
  if (voiceSearchInput) {
    voiceSearchInput.placeholder = i18n('voice_search_placeholder');
  }

  // Update loading voices text
  const loadingVoicesSpan = voiceLoadingIndicator?.querySelector('span');
  if (loadingVoicesSpan) {
    loadingVoicesSpan.textContent = i18n('loading_voices');
  }

  // Update all elements with data-i18n attributes
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) (el as HTMLElement).title = i18n(key);
  });

  document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    const key = el.getAttribute('data-i18n-alt');
    if (key) (el as HTMLImageElement).alt = i18n(key);
  });

  document.querySelectorAll('[data-i18n-text]').forEach((el) => {
    const key = el.getAttribute('data-i18n-text');
    if (key) el.textContent = i18n(key);
  });

  if (voicePanelToggle && voiceSelectorEl) {
    const collapsed = voiceSelectorEl.classList.contains('voice-selector--collapsed');
    voicePanelToggle.title = i18n(collapsed ? 'expand' : 'minimize');
  }

  updateLanguageToggleIcon();
}

// 中 / EN 双语切换按钮图标：与主题按钮同构，只显示一个字符图形——「将要切到的目标语言」
// （当前中文 → 显 EN；当前英文或其它 → 显中），点击即切到该语言
function updateLanguageToggleIcon(): void {
  const useEl = document.querySelector('#language-toggle-icon');
  if (!useEl) return;
  const next = state.interfaceLanguage === 'zh_CN' ? '#icon-lang-en' : '#icon-lang-zh';
  useEl.setAttribute('href', next);
}

// 点击切换按钮：中文 ⇄ 英文（按钮本身为「中」「EN」双字符图标，始终象征两种语言，无需随切换更新）
export async function toggleInterfaceLanguage(): Promise<void> {
  const next = state.interfaceLanguage === 'zh_CN' ? 'en' : 'zh_CN';
  await changeInterfaceLanguage(next);
}
