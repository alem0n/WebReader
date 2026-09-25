/**
 * 音色搜索框与下拉列表的事件绑定。
 *
 * 交互：输入严格过滤、聚焦/点击按当前音色语言展示、键盘上下回车 Esc 导航、
 * 清除按钮重置为全语言、点击下拉外部自动收起。
 */
import { state } from '../state';
import { updateClearButton, setupDisabledTooltips } from '../ui';
import { filterVoices, selectVoice, updateHighlightedOption, formatVoiceName } from '../voices';
import { ensureVoiceSelected } from '../voices/voice-selection';
import { saveSettings } from '../settings';

export function bindVoiceSearch(rootGetById: (id: string) => any): void {
  state.voiceSearchClear = rootGetById('voice-search-clear');

  state.voiceSearchInput!.addEventListener('input', (e) => {
    state.isUserTyping = true;
    updateClearButton();
    state.highlightedIndex = -1; // Reset highlighted index when typing
    filterVoices((e.target as any).value, true); // Use strict filter when typing
    if (state.filteredVoices.length > 0) {
      state.voiceDropdown!.classList.remove('hidden');
    } else {
      state.voiceDropdown!.classList.add('hidden');
    }
  });

  state.voiceSearchInput!.addEventListener('focus', () => {
    if (state.voiceSearchInput!.disabled) return;
    // When focusing (before user types), show voices of same language
    if (!state.isUserTyping) {
      filterVoices('', false, true); // Filter by selected voice's language
      if (state.filteredVoices.length > 0) {
        state.voiceDropdown!.classList.remove('hidden');
      }
    }
  });

  state.voiceSearchInput!.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.voiceSearchInput!.disabled) return;
    // When clicking (before user types), show voices of same language
    if (!state.isUserTyping) {
      filterVoices('', false, true); // Filter by selected voice's language
      if (state.filteredVoices.length > 0) {
        state.voiceDropdown!.classList.remove('hidden');
      }
    }
  });

  // Reset typing flag when user clicks away or selects a voice
  state.voiceSearchInput!.addEventListener('blur', () => {
    // Small delay to allow selection before resetting
    setTimeout(() => {
      state.isUserTyping = false;
    }, 200);
  });

  // Clear button click handler - reset to default state (show all voices, clear selection)
  state.voiceSearchClear!.addEventListener('click', (e) => {
    if (state.voiceSearchInput!.disabled) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    state.voiceSearchInput!.value = '';
    // 清除指定 = 回到跟随界面语言：撤销手选标记，由 ensureVoiceSelected 派生默认音色
    // 并落实为单一来源 selectedVoice。避免「selectedVoice 为空」的不自洽态 ——
    // 那样播放会报「请选择音色」，且点击跳转拿不到音色
    state.voiceSelectionIsManual = false;
    saveSettings();
    ensureVoiceSelected();
    updateClearButton();
    state.isUserTyping = false; // Reset typing flag when clearing
    state.highlightedIndex = -1; // Reset highlighted index
    filterVoices('', false, false); // Default state: show all voices (all languages)
    state.voiceDropdown!.classList.remove('hidden');
    state.voiceSearchInput!.focus();
  });

  // Set initial clear button state
  updateClearButton();

  // Setup tooltips for voice search (call once on init, then updateButtonStates will manage it)
  setupDisabledTooltips();

  // Keyboard navigation for dropdown
  state.voiceSearchInput!.addEventListener('keydown', (e) => {
    // Only handle keys when dropdown is visible
    if (state.voiceDropdown!.classList.contains('hidden')) {
      return;
    }

    const options = state.voiceDropdown!.querySelectorAll('.voice-option:not(.voice-option[style*="display: none"])');
    const totalOptions = options.length;

    if (totalOptions === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        state.highlightedIndex = (state.highlightedIndex + 1) % totalOptions;
        updateHighlightedOption();
        break;

      case 'ArrowUp':
        e.preventDefault();
        state.highlightedIndex = state.highlightedIndex <= 0 ? totalOptions - 1 : state.highlightedIndex - 1;
        updateHighlightedOption();
        break;

      case 'Enter':
        e.preventDefault();
        if (state.highlightedIndex >= 0 && state.highlightedIndex < totalOptions && state.highlightedIndex < state.filteredVoices.length) {
          const voice = state.filteredVoices[state.highlightedIndex];
          selectVoice(voice);
          state.voiceSearchInput!.value = formatVoiceName(voice);
          updateClearButton();
          state.isUserTyping = false;
          state.highlightedIndex = -1;
          state.voiceDropdown!.classList.add('hidden');
        }
        break;

      case 'Escape':
        e.preventDefault();
        state.highlightedIndex = -1;
        state.voiceDropdown!.classList.add('hidden');
        state.voiceSearchInput!.blur();
        break;
    }
  });

  // Reset highlighted index when showing dropdown
  state.voiceSearchInput!.addEventListener('focus', () => {
    if (!state.isUserTyping) {
      state.highlightedIndex = -1;
    }
  });

  state.voiceSearchInput!.addEventListener('click', () => {
    if (!state.isUserTyping) {
      state.highlightedIndex = -1;
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const isClickInside = (e.target as any).closest('.dropdown-container') || (e.target as any).closest('#voice-dropdown');
    if (!isClickInside) {
      state.voiceDropdown!.classList.add('hidden');
    }
  });

  // Prevent dropdown from closing when clicking inside it
  state.voiceDropdown!.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}
