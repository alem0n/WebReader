/**
 * 音色下拉的过滤 / 渲染 / 选择。
 *
 * 从 voices.ts 拆出（docs/tech-debt.md TD-010）：下拉 UI 的过滤排序、选项渲染、
 * 点击选中与高亮跟随。音色的显示文本统一由 ./format 生成，选择后写回存储。
 */
import { state } from '../state';
import type { PresetVoice } from '../../shared/types';
import { getTranslatedGender } from '../i18n';
import { setupDisabledTooltips, updateClearButton, updatePlayButtonState } from '../ui';
import { saveSettings } from '../settings';
import { createContentLogger } from '../log';
import { formatVoiceName } from './format';

const logger = createContentLogger('voices');

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
