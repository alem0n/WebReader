/**
 * 音色下拉的过滤 / 渲染 / 选择。
 *
 * 从 voices.ts 拆出：下拉 UI 的过滤排序、选项渲染、
 * 点击选中与高亮跟随。音色的显示文本统一由 ./format 生成，选择后写回存储。
 */
import { state } from '../state';
import type { PresetVoice } from '../../shared/types';
import { getTranslatedGender } from '../i18n';
import { setupDisabledTooltips, updateClearButton, updatePlayButtonState } from '../ui';
import { saveSettings } from '../settings';
import { createContentLogger } from '../log';
import { formatVoiceName } from './format';
// 引擎无关的音色过滤下沉 shared，与 popup 共用同一份，避免两层漂移
import { matchVoiceSearchTerm } from '../../shared/voice-search';

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
    // 引擎无关过滤：名称 / 语言代码 / 语言名（中英）/ 国家名 / 性别皆可命中，
    // 与 popup 同一实现（shared/voice-search）
    state.filteredVoices = state.allVoices.filter((voice) => matchVoiceSearchTerm(voice, term));
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

export function selectVoice(voice: PresetVoice) {
  logger.debug('selectVoice called:', {
    voice: voice?.name,
    wasManual: state.voiceSelectionIsManual,
  });

  state.selectedVoice = voice;
  // 手选音色落盘（name 持久化）；派生的默认音色不在此落盘，由 ensureVoiceSelected 保证标记
  state.voiceSelectionIsManual = true;

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
