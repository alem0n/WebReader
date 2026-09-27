/** i18n (migrated from content.js) */
import { state } from './state';
import { getWidget } from './widget';
import { createContentLogger } from './log';
import { countryNamesEn, countryTranslations, genderTranslations, languageTranslations } from '../shared/language-names';

const logger = createContentLogger('i18n');
export async function loadI18nMessages(locale: string) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'loadI18nMessages', locale: locale }, (response) => {
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
        state.i18nMessages = response.messages;
        logger.debug('Loaded', Object.keys(response.messages).length, 'messages for locale:', locale);
        resolve(response.messages);
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

export function i18n(key: string) {
  if (state.i18nMessages && state.i18nMessages[key]) {
    return state.i18nMessages[key];
  }
  // Fallback to chrome.i18n if messages not loaded yet
  return chrome.i18n.getMessage(key) || key;
}

export async function loadInterfaceLanguage() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['interfaceLanguage'], async (data) => {
        const locale = data.interfaceLanguage || 'en';
        await loadI18nMessages(locale);
        state.interfaceLanguage = locale;
        resolve(locale);
      });
    } else {
      const stored = localStorage.getItem('interfaceLanguage');
      const locale = stored || 'en';
      loadI18nMessages(locale).then(() => {
        state.interfaceLanguage = locale;
        resolve(locale);
      });
    }
  });
}

export async function saveInterfaceLanguage(locale: string) {
  state.interfaceLanguage = locale;
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ interfaceLanguage: locale });
  } else {
    localStorage.setItem('interfaceLanguage', locale);
  }
}

export async function changeInterfaceLanguage(locale: string) {
  logger.info('Changing interface language to:', locale);
  await saveInterfaceLanguage(locale);
  // Load new i18n messages
  await loadI18nMessages(locale);
  logger.debug('Messages loaded, applying to UI...');
  // Apply the new language to all elements
  applyInterfaceLanguage(locale);
  logger.debug('Interface language changed successfully');
}

export function applyInterfaceLanguage(locale: string) {
  const widget = getWidget();
  if (!widget) {
    logger.warn('Widget not found, cannot apply language');
    return;
  }

  logger.debug('Applying language to widget elements, locale:', locale);

  // Update placeholder for voice search
  const voiceSearch = widget.querySelector('#voice-search') as any;
  if (voiceSearch) {
    voiceSearch.placeholder = i18n('voice_search_placeholder');
    logger.debug('Voice search placeholder updated');
  }

  widget.querySelectorAll('[data-i18n-label]').forEach((el: any) => {
    const key = el.getAttribute('data-i18n-label');
    if (key) {
      el.textContent = i18n(key);
    }
  });

  // Update loading voices text
  const loadingVoicesSpan = widget.querySelector('#voice-loading span') as any;
  if (loadingVoicesSpan) {
    loadingVoicesSpan.textContent = i18n('loading_voices');
    logger.debug('Loading voices text updated');
  }

  // Update placeholder for text content
  state.textContent = widget.querySelector('#text-content') as any;
  if (state.textContent) {
    const placeholder = `${i18n('ready_to_listen')}\n━━━━━━━━━━━━━━━\n${i18n('paste_text_placeholder_line1')}\n${i18n('then_click_play')}`;
    state.textContent.setAttribute('data-placeholder', placeholder);
    // If content is empty, trigger placeholder update
    if (!state.textContent.textContent.trim()) {
      state.textContent.textContent = '';
    }
    logger.debug('Text content placeholder updated');
  }

  // Update button titles
  const buttons: Record<string, string> = {
    '#play-pause-btn': 'play',
    '#prev-btn': 'previous_sentence',
    '#next-btn': 'next_sentence',
    '#stop-btn': 'stop',
    '#clear-btn': 'stop_and_clear',
    '#tts-widget-minimize': 'minimize',
    '#tts-widget-close': 'close',
    '#error-close-btn': 'close',
  };

  for (const [selector, key] of Object.entries(buttons)) {
    const btn = widget.querySelector(selector) as HTMLElement | null;
    if (btn && key) {
      const oldTitle = btn.title;
      btn.title = i18n(key);
      if (oldTitle !== btn.title) {
        logger.debug('Button', selector, 'title updated:', oldTitle, '->', btn.title);
      }
    }
  }

  // Update button alt texts
  // 按钮内联 SVG 无需 alt 文本（aria-hidden），原 img alt 映射随按钮一并移除

  // Update auth screen texts
  const authHintText = widget.querySelector('#auth-hint-text') as any;
  if (authHintText) {
    const t = i18n('auth_login_hint');
    authHintText.textContent = t !== 'auth_login_hint' ? t : 'To open the player, please sign in first.';
  }
  const authSignInText = widget.querySelector('#auth-signin-text') as any;
  if (authSignInText) {
    const t = i18n('auth_sign_in_google');
    authSignInText.textContent = t !== 'auth_sign_in_google' ? t : 'Sign in with Google';
  }
  const userMenuCancelText = widget.querySelector('#user-menu-cancel-text') as any;
  if (userMenuCancelText) {
    const t = i18n('cancel');
    userMenuCancelText.textContent = t !== 'cancel' ? t : 'Cancel';
  }
  const userMenuLogoutText = widget.querySelector('#user-menu-logout-text') as any;
  if (userMenuLogoutText) {
    const t = i18n('sign_out');
    userMenuLogoutText.textContent = t !== 'sign_out' ? t : 'Sign out';
  }

  // Update status text using stored status key
  state.statusText = widget.querySelector('#status-text') as any;
  if (state.statusText) {
    const statusKey = state.statusText.getAttribute('data-status-key');
    const currentText = state.statusText.textContent.trim();

    if (statusKey) {
      // We have a stored key, use it to get the new translation
      const newText = i18n(statusKey);
      state.statusText.textContent = newText;
      logger.debug('Status text updated using key:', statusKey, '->', newText);
    } else {
      // No key stored, try to determine from current text
      // Check all possible status translations
      const statusKeys = ['ready', 'playing', 'paused', 'stopped', 'loading_voices', 'select_text_to_start', 'loading_audio'];
      let foundKey = null;

      // First try exact match with English
      const statusMap: Record<string, string> = {
        Ready: 'ready',
        Playing: 'playing',
        Paused: 'paused',
        Stopped: 'stopped',
        'Loading voices...': 'loading_voices',
        'Select text to start': 'select_text_to_start',
        'Loading audio...': 'loading_audio',
      };

      for (const [text, key] of Object.entries(statusMap)) {
        if (currentText === text) {
          foundKey = key;
          break;
        }
      }

      // If not found, try matching against current i18n values (might already be translated)
      if (!foundKey && currentText) {
        for (const key of statusKeys) {
          const translated = i18n(key);
          if (currentText === translated) {
            // Already in correct language, just store the key
            foundKey = key;
            break;
          }
        }
      }

      if (foundKey) {
        state.statusText.textContent = i18n(foundKey);
        state.statusText.setAttribute('data-status-key', foundKey);
        logger.debug('Status text updated by mapping:', currentText, '->', i18n(foundKey), '(key:', foundKey + ')');
      } else {
        // Default to ready if we can't determine
        state.statusText.textContent = i18n('ready');
        state.statusText.setAttribute('data-status-key', 'ready');
        logger.debug('Status text set to default (ready), original was:', currentText);
      }
    }
  }

  // Update minimize button title based on current state
  state.minimizeBtn = widget.querySelector('#tts-widget-minimize') as any;
  if (state.minimizeBtn) {
    state.isMinimized = widget.classList.contains('minimized');
    state.minimizeBtn.title = i18n(state.isMinimized ? 'expand' : 'minimize');
    logger.debug('Minimize button title updated');
  }

  const voicePanelToggleBtn = widget.querySelector('#voice-panel-toggle') as any;
  if (voicePanelToggleBtn) {
    const vSel = widget.querySelector('.voice-selector') as any;
    const voiceCollapsed = vSel && vSel.classList.contains('voice-selector--collapsed');
    voicePanelToggleBtn.title = i18n(voiceCollapsed ? 'expand' : 'minimize');
  }

  // Refresh voice labels (country, gender) to use new interface language
  if (typeof window.edgeTTSRefreshVoiceLabels === 'function') {
    window.edgeTTSRefreshVoiceLabels();
  }

  logger.debug('Language application complete');
}

export function getTranslatedLanguageName(englishName: string) {
  const loc = state.interfaceLanguage || 'en';
  const map = languageTranslations[loc];
  return (map && map[englishName]) || englishName;
}

export function getTranslatedCountry(countryCode: any) {
  const loc = state.interfaceLanguage || 'en';
  const map = countryTranslations[loc] || countryNamesEn;
  return (map && map[countryCode]) || countryNamesEn[countryCode] || countryCode;
}

export function getTranslatedGender(gender: any) {
  if (!gender) return '';
  const loc = state.interfaceLanguage || 'en';
  const map = genderTranslations[loc] || genderTranslations.en;
  return (map && map[gender]) || gender;
}

export function getFlagIdForLocale(locale: string) {
  if (!locale || typeof locale !== 'string') return null;
  const parts = locale.split('-');
  const countryCode = parts.length > 1 ? parts[1].toUpperCase() : null;
  const langCode = parts[0].toLowerCase();
  const localeMap: Record<string, string> = {
    US: 'flag-us-square',
    GB: 'flag-en-square',
    AU: 'flag-au-square',
    CA: 'flag-ca-square',
    ZA: 'flag-za-square',
    AE: 'flag-ae-square',
    DE: 'flag-de-square',
    FR: 'flag-fr-square',
    ES: 'flag-es-square',
    IT: 'flag-it-square',
    PT: 'flag-pt-square',
    PL: 'flag-pl-square',
    RU: 'flag-ru-square',
    NL: 'flag-nl-square',
    TR: 'flag-tr-square',
    CN: 'flag-cn-square',
    JP: 'flag-jp-square',
    KR: 'flag-kr-square',
    SE: 'flag-se-square',
    NO: 'flag-no-square',
    DK: 'flag-da-square',
    FI: 'flag-fi-square',
    IL: 'flag-he-square',
    IN: 'flag-in-square',
    SA: 'flag-sa-square',
  };
  if (countryCode && localeMap[countryCode]) return localeMap[countryCode];
  const langFallback: Record<string, string> = {
    en: 'flag-en-square',
    ar: 'flag-sa-square',
    zh: 'flag-cn-square',
    ja: 'flag-jp-square',
    ko: 'flag-kr-square',
    hi: 'flag-in-square',
    pt: 'flag-pt-square',
    es: 'flag-es-square',
    de: 'flag-de-square',
    fr: 'flag-fr-square',
    it: 'flag-it-square',
    ru: 'flag-ru-square',
    pl: 'flag-pl-square',
    nl: 'flag-nl-square',
    tr: 'flag-tr-square',
    sv: 'flag-se-square',
    da: 'flag-da-square',
    fi: 'flag-fi-square',
    no: 'flag-no-square',
    he: 'flag-he-square',
  };
  return langFallback[langCode] || 'flag-en-square';
}
