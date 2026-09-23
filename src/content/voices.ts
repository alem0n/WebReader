/** voices (migrated from content.js) */
import { sleep } from './utils';
import { state } from './state';
import { getFlagIdForLocale, getTranslatedCountry, getTranslatedGender, getTranslatedLanguageName } from './i18n';
import { languageNames } from '../shared/language-names';
import type { PresetVoice } from '../shared/types';
import { detectLanguage } from '../shared/detect-language';
import { hideError, setupDisabledTooltips, showError, updateButtonStates, updateClearButton, updatePlayButtonState } from './ui';
import { loadSettings, saveSettings, syncSpeedSelectFromStored } from './settings';
import { createContentLogger } from './log';

const logger = createContentLogger('voices');

const VOICES_CACHE_KEY = 'tts-voices-cache';
const VOICES_CACHE_TIMESTAMP_KEY = 'tts-voices-cache-timestamp';
const VOICES_CACHE_DURATION = 24 * 60 * 60 * 1000;

function formatVoiceDetails(voice: PresetVoice) {
  const locale = voice.language || '';
  let languageName = locale;
  for (const [code, name] of Object.entries(languageNames)) {
    if (locale.startsWith(code)) {
      languageName = name;
      break;
    }
  }
  const parts = locale.split('-');
  const countryCode = parts.length > 1 ? parts[1].toUpperCase() : null;
  const countryName = countryCode ? getTranslatedCountry(countryCode) : null;
  const flagId = getFlagIdForLocale(locale);
  return { languageName, countryName, flagId };
}

export function formatVoiceName(voice: PresetVoice) {
  let language = voice.language || '';
  let voiceName = voice.name || '';

  // Get full language name (English base) then translate for interface locale
  let fullLanguageName = language;
  for (const [code, name] of Object.entries(languageNames)) {
    if (language.startsWith(code)) {
      fullLanguageName = getTranslatedLanguageName(name);
      break;
    }
  }

  // Extract voice name without language code, Neural, and Multilingual
  let displayName = voiceName;
  // Remove language code prefix (e.g., "en-US-")
  if (language) {
    displayName = displayName.replace(new RegExp(`^${language}-`, 'i'), '');
  }
  // Remove Neural suffix
  displayName = displayName.replace(/Neural$/i, '');
  // Remove Multilingual (wherever it appears)
  displayName = displayName.replace(/Multilingual/gi, '');
  // Remove Expressive
  displayName = displayName.replace(/Expressive/gi, '');
  // Remove any remaining hyphens at the end and clean up double hyphens
  displayName = displayName.replace(/-+$/, '').replace(/^-+/, '').replace(/-+/g, '-');

  // Add country in parentheses if available
  let result = `${fullLanguageName} - ${displayName}`;
  const { countryName } = formatVoiceDetails(voice);
  if (countryName) {
    result += ` (${countryName})`;
  }

  return result;
}

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

      // Restore saved voice and continue with existing logic
      const settings = await loadSettings();
      if (state.autoDetectLanguage) {
        (state as any).selectedVoice = null;
        logger.debug('Auto-detect is ON, selectedVoice cleared');
      } else if ((settings as any).selectedVoice) {
        const savedVoice = state.allVoices.find((v) => v.name === (settings as any).selectedVoice);
        if (savedVoice) {
          selectVoice(savedVoice, false);
          state.voiceSearchInput!.value = formatVoiceName(savedVoice);
          if (typeof updateClearButton === 'function') updateClearButton();
          logger.debug('Restored saved voice:', savedVoice.name);
        } else {
          state.autoDetectLanguage = true;
          if (state.toggleCheckboxes.autoDetectLanguage) state.toggleCheckboxes.autoDetectLanguage.checked = true;
          saveSettings();
          logger.debug('Saved voice not found, enabled auto-detect');
        }
      } else {
        state.autoDetectLanguage = true;
        if (state.toggleCheckboxes.autoDetectLanguage) state.toggleCheckboxes.autoDetectLanguage.checked = true;
        saveSettings();
        logger.debug('No voice selected, enabled auto-detect');
      }

      if (state.speedSelect) {
        (state as any).playbackSpeed = syncSpeedSelectFromStored(state.speedSelect, (settings as any).playbackSpeed);
      }

      const existingText = (state.textContent!.textContent || state.textContent!.innerText || '').trim();
      if (state.autoDetectLanguage && existingText.length > 20) {
        logger.debug('Voices loaded, checking existing text...');
        const detectedLang = detectLanguage(existingText);
        if (detectedLang) {
          const langPrefix = detectedLang.split('-')[0];
          const voicesForLang = state.allVoices.filter(
            (v) =>
              v.language &&
              (v.language === detectedLang ||
                v.language.startsWith(detectedLang + '-') ||
                (v.language.startsWith(langPrefix + '-') && !v.language.startsWith('fil-')))
          );
          if (voicesForLang.length > 0) {
            const voiceToShow = voicesForLang[0];
            state.voiceSearchInput!.value = formatVoiceName(voiceToShow);
            if (typeof updateClearButton === 'function') updateClearButton();
            logger.debug(`Auto-detected after loading: ${detectedLang} → ${voiceToShow.name}`);
          }
        }
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

      // Try to restore saved voice
      const settings = await loadSettings();

      if (state.autoDetectLanguage) {
        // When auto-detect is enabled, clear any saved voice
        (state as any).selectedVoice = null;
        logger.debug('Auto-detect is ON, selectedVoice cleared');
      } else if ((settings as any).selectedVoice) {
        // Restore saved voice only if auto-detect is OFF
        const savedVoice = state.allVoices.find((v) => v.name === (settings as any).selectedVoice);
        if (savedVoice) {
          selectVoice(savedVoice, false);
          state.voiceSearchInput!.value = formatVoiceName(savedVoice);
          if (typeof updateClearButton === 'function') updateClearButton();
          logger.debug('Restored saved voice:', savedVoice.name);
        } else {
          // Saved voice not found, enable auto-detect
          state.autoDetectLanguage = true;
          if (state.toggleCheckboxes.autoDetectLanguage) state.toggleCheckboxes.autoDetectLanguage.checked = true;
          saveSettings();
          logger.debug('Saved voice not found, enabled auto-detect');
        }
      } else {
        // No voice selected and auto-detect is off, enable auto-detect
        state.autoDetectLanguage = true;
        if (state.toggleCheckboxes.autoDetectLanguage) state.toggleCheckboxes.autoDetectLanguage.checked = true;
        saveSettings();
        logger.debug('No voice selected, enabled auto-detect');
      }

      if (state.speedSelect) {
        (state as any).playbackSpeed = syncSpeedSelectFromStored(state.speedSelect, (settings as any).playbackSpeed);
      }

      // If there's already text and auto-detect is on, detect language now
      const existingText = (state.textContent!.textContent || state.textContent!.innerText || '').trim();
      if (state.autoDetectLanguage && existingText.length > 20) {
        logger.debug('Voices loaded, checking existing text...');
        const detectedLang = detectLanguage(existingText);
        if (detectedLang) {
          // More precise language matching: try exact match first, then prefix with hyphen
          const langPrefix = detectedLang.split('-')[0];
          const voicesForLang = state.allVoices.filter(
            (v) =>
              v.language &&
              (v.language === detectedLang ||
                v.language.startsWith(detectedLang + '-') ||
                (v.language.startsWith(langPrefix + '-') && !v.language.startsWith('fil-')))
          );
          if (voicesForLang.length > 0) {
            const voiceToShow = voicesForLang[0];
            state.voiceSearchInput!.value = formatVoiceName(voiceToShow);
            if (typeof updateClearButton === 'function') updateClearButton();
            logger.debug(`Auto-detected after loading: ${detectedLang} → ${voiceToShow.name}`);
          }
        }
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

export function filterVoices(searchTerm: any, _isStrictFilter = false, filterByLanguage = false) {
  const term = searchTerm.toLowerCase().trim();

  // If no search term and filterByLanguage is true, show voices of selected/displayed language
  let voiceForLanguage = (state as any).selectedVoice;
  if (!voiceForLanguage && filterByLanguage && state.voiceSearchInput!.value.trim()) {
    voiceForLanguage = state.allVoices.find((v) => formatVoiceName(v) === state.voiceSearchInput!.value.trim());
  }
  if (!term && filterByLanguage && voiceForLanguage && voiceForLanguage.language) {
    const selectedLanguage = voiceForLanguage.language.split('-')[0]; // Get base language (e.g., "en" from "en-AU")
    state.filteredVoices = state.allVoices.filter((voice) => voice.language && voice.language.startsWith(selectedLanguage));
  } else if (!term) {
    // Show all voices when no search term
    state.filteredVoices = [...state.allVoices];
  } else {
    // Strict filter: search in name, language, and gender
    state.filteredVoices = state.allVoices.filter((voice) => {
      const nameMatch = voice.name?.toLowerCase().includes(term);
      const languageMatch = voice.language?.toLowerCase().includes(term);
      const genderMatch = voice.gender?.toLowerCase().includes(term);
      // Also search in formatted name for better user experience
      const formattedName = formatVoiceName(voice).toLowerCase();
      const formattedMatch = formattedName.includes(term);
      return nameMatch || languageMatch || genderMatch || formattedMatch;
    });
  }

  // Sort by language, then by voice name
  state.filteredVoices.sort((a, b) => {
    const langA = a.language || '';
    const langB = b.language || '';
    if (langA !== langB) {
      return langA.localeCompare(langB);
    }
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  renderVoiceDropdown();
}

export function renderVoiceDropdown() {
  state.voiceDropdown!.innerHTML = '';

  if (state.filteredVoices.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'voice-option';
    emptyItem.style.padding = '15px';
    emptyItem.style.textAlign = 'center';
    emptyItem.style.color = '#999';
    emptyItem.textContent = 'No voices found';
    state.voiceDropdown!.appendChild(emptyItem);
    return;
  }

  state.filteredVoices.slice(0, 100).forEach((voice, index) => {
    const option = document.createElement('div');
    option.className = 'voice-option';
    if ((state as any).selectedVoice && (state as any).selectedVoice.name === voice.name) {
      option.classList.add('selected');
    }
    if (index === state.highlightedIndex) {
      option.classList.add('highlighted');
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'voice-option-name';
    nameDiv.textContent = formatVoiceName(voice);

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'voice-option-details';
    if (voice.gender) {
      detailsDiv.textContent = getTranslatedGender(voice.gender);
    }

    option.appendChild(nameDiv);
    option.appendChild(detailsDiv);

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      selectVoice(voice);
      state.voiceSearchInput!.value = formatVoiceName(voice);
      updateClearButton();
      state.isUserTyping = false; // Reset typing flag when selecting a voice
      state.highlightedIndex = -1; // Reset highlighted index
      state.voiceDropdown!.classList.add('hidden');
    });

    state.voiceDropdown!.appendChild(option);
  });

  // Scroll to highlighted element if needed
  if (state.highlightedIndex >= 0) {
    const options = state.voiceDropdown!.querySelectorAll('.voice-option');
    if (options[state.highlightedIndex]) {
      options[state.highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

export function formatVoiceDisplayName(voice: PresetVoice) {
  if (!voice) return '';

  // Extract short name from full name (e.g., "en-AU-WilliamMultilingualNeural" -> "William")
  const nameParts = voice.name.split('-');
  let shortName = nameParts.length > 2 ? nameParts[2] : voice.name;

  // Remove "Multilingual", "Neural" suffixes
  shortName = shortName.replace(/Multilingual|Neural/g, '').trim();

  // Get language name (e.g., "en-AU" -> "English (Australia)")
  const langName = voice.language || '';

  // Format: "Language - Name (Gender)"
  let display = langName;
  if (shortName) {
    display += display ? ` - ${shortName}` : shortName;
  }
  if (voice.gender) {
    display += ` (${getTranslatedGender(voice.gender)})`;
  }

  return display || voice.name; // Fallback to technical name
}

export function selectVoice(voice: PresetVoice, disableAutoDetect = true) {
  logger.debug('selectVoice called:', {
    voice: voice?.name,
    disableAutoDetect,
    wasAutoDetect: state.autoDetectLanguage,
  });

  (state as any).selectedVoice = voice;

  if (disableAutoDetect) {
    state.autoDetectLanguage = false;
    if (state.toggleCheckboxes.autoDetectLanguage) state.toggleCheckboxes.autoDetectLanguage.checked = false;
    logger.debug('Auto-detect disabled by user selection');
  }

  updatePlayButtonState();
  // Update tooltips to reflect new state
  setupDisabledTooltips();
  saveSettings();
}

export function updateHighlightedOption() {
  const options = state.voiceDropdown!.querySelectorAll('.voice-option');
  options.forEach((option, index) => {
    if (index === state.highlightedIndex) {
      option.classList.add('highlighted');
      option.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      option.classList.remove('highlighted');
    }
  });
}
