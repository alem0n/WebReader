/**
 * 由播放 / 加载状态驱动的界面控件更新：按钮与开关的启用禁用、状态文本、
 * 错误提示、音色面板折叠。
 *
 * 网页内跟读开关与既有开关同步禁用/启用：播放/加载期间禁止变更，防止中途切换
 * 导致页面残留高亮 span 或结构未还原（AGENTS.md 硬约束）。
 */
import { getWidgetElementById } from '../widget';
import { state } from '../state';
import { i18n } from '../i18n';
import { saveSettings } from '../settings';
import { TOGGLE_SETTINGS, type ToggleKey } from '../../shared/toggle-settings';
import { createContentLogger } from '../log';
import { setupDisabledTooltips } from './tooltips';

const logger = createContentLogger('ui/controls');

/**
 * 网页内跟读显示的两个开关与既有开关同步禁用/启用。
 *
 * 播放/加载期间禁止变更，防止中途切换导致页面残留高亮 span 或结构未还原（AGENTS.md 硬约束）。
 */
function setInlineCheckboxesDisabled(disabled: boolean): void {
  // 遍历开关声明表：恢复可用时仍从属于被依赖开关（主开关关闭则保持禁用）
  for (const def of TOGGLE_SETTINGS) {
    const cb = state.toggleCheckboxes[def.key];
    if (!cb) continue;
    const depOff = def.dependsOn ? !(state as Record<ToggleKey, boolean>)[def.dependsOn] : false;
    cb.disabled = disabled || depOff;
  }
}

export function updateButtonStates() {
  // Check if voices are loading
  const voicesLoading = state.voiceLoadingIndicator && !state.voiceLoadingIndicator.classList.contains('hidden');

  // If voices are loading, disable all buttons except Clear
  if (voicesLoading) {
    (state.playPauseBtn as any).disabled = true;
    (state.stopBtn as any).disabled = true;
    (state.prevBtn as any).disabled = true;
    (state.nextBtn as any).disabled = true;
    (state.clearBtn as any).disabled = false; // Always enabled
    updateClearButton();
    updateStatusText(i18n('loading_voices'), 'loading_voices');
    return;
  }

  // If we are currently loading page text (Read entire page), disable everything
  // except the red "Stop and clear" button so user clearly sees loading state.
  if (state.isCollectPageLoading) {
    (state.playPauseBtn as any).disabled = true;
    (state.stopBtn as any).disabled = true;
    (state.prevBtn as any).disabled = true;
    (state.nextBtn as any).disabled = true;
    (state.clearBtn as any).disabled = false; // user can always stop and clear

    (state.voiceSearchInput as any).disabled = true;
    (state.speedSelect as any).disabled = true;
    setInlineCheckboxesDisabled(true);
    updateClearButton();

    updateStatusText(i18n('loading_audio'), 'loading_audio');
    return;
  }

  const isPlaying = state.sentencePlayer && state.sentencePlayer.isPlaying && !state.sentencePlayer.isPaused;
  const isPaused = state.sentencePlayer && state.sentencePlayer.isPaused;
  const text = (state.textContent!.textContent || state.textContent!.innerText || '').trim();
  const hasText = text.length > 0;
  const isActivePlayback = isPlaying || isPaused;

  logger.debug('updateButtonStates called:', {
    isPlaying,
    isPaused,
    isActivePlayback,
    isLoading: state.isLoading,
    sentencePlayer: !!state.sentencePlayer,
  });

  // Update status text based on state
  if (!state.isLoading) {
    if (isPlaying) {
      updateStatusText(i18n('playing'), 'playing');
    } else if (isPaused) {
      updateStatusText(i18n('paused'), 'paused');
    } else if (!hasText) {
      updateStatusText(i18n('select_text_to_start'), 'select_text_to_start');
    } else {
      updateStatusText(i18n('ready'), 'ready');
    }
  }

  // Update unified Play/Pause button
  if (isActivePlayback || state.isLoading) {
    (state.playPauseBtn as any).disabled = state.isLoading;

    // Update icon and class based on state
    const btnIconUse = state.playPauseBtn!.querySelector('.btn-icon use') as any;
    if (isPlaying) {
      btnIconUse.setAttribute('href', '#icon-pause');
      state.playPauseBtn!.className = 'btn btn-secondary btn-round';
      state.playPauseBtn!.title = i18n('pause');
    } else if (isPaused) {
      btnIconUse.setAttribute('href', '#icon-play');
      state.playPauseBtn!.className = 'btn btn-primary btn-round';
      state.playPauseBtn!.title = i18n('play');
    }
  } else {
    // No active playback - use updatePlayButtonState for proper logic
    updatePlayButtonState();
    const btnIconUse = state.playPauseBtn!.querySelector('.btn-icon use') as any;
    btnIconUse.setAttribute('href', '#icon-play');
    state.playPauseBtn!.className = 'btn btn-primary btn-round';
    state.playPauseBtn!.title = 'Play';
  }

  // Stop button should remain enabled during loading and active playback (user can stop at any time)
  // Only disable if there's no active playback AND no loading
  (state.stopBtn as any).disabled = !(isPlaying || isPaused || state.isLoading);

  // Clear button should always be enabled
  (state.clearBtn as any).disabled = false;

  // Prev/Next buttons: Always enabled when text exists and sentencePlayer is initialized
  // With debouncing, users can click rapidly to navigate without waiting for audio

  // Prev button: enabled only if there is text AND sentences exist AND not at the first one
  if (hasText && state.sentencePlayer && state.sentencePlayer.sentences.length > 0) {
    (state.prevBtn as any).disabled = state.sentencePlayer.currentIndex === 0;
  } else {
    (state.prevBtn as any).disabled = true;
  }

  // Next button: enabled only if there is text AND sentences exist AND not at the last one
  if (hasText && state.sentencePlayer && state.sentencePlayer.sentences.length > 0) {
    (state.nextBtn as any).disabled = state.sentencePlayer.currentIndex >= state.sentencePlayer.sentences.length - 1;
  } else {
    (state.nextBtn as any).disabled = true;
  }

  // Disable voice selection, auto-detect and speed during playback
  (state.voiceSearchInput as any).disabled = isActivePlayback;
  (state.speedSelect as any).disabled = isActivePlayback;
  setInlineCheckboxesDisabled(!!isActivePlayback);
  updateClearButton();

  // Setup tooltips for disabled elements and voice search
  setupDisabledTooltips();
}

export function updatePlayButtonState() {
  logger.debug('updatePlayButtonState called');
  const text = (state.textContent!.textContent || state.textContent!.innerText || '').trim();
  const hasText = text.length > 0;
  const hasVoice = state.selectedVoice !== null;
  const shouldEnable = hasText && hasVoice && !state.isLoading;

  (state.playPauseBtn as any).disabled = !shouldEnable;

  // Debug logging
  if (!shouldEnable) {
    logger.debug('Play button disabled because:', {
      hasText,
      textLength: text.length,
      selectedVoice: state.selectedVoice?.name || null,
      hasVoice,
      isLoading: state.isLoading,
      shouldEnable,
    });
  } else {
    logger.debug('Play button enabled');
  }
}

export function updateClearButton() {
  if (!state.voiceSearchClear) return;
  if ((state.voiceSearchInput as any).disabled || !state.voiceSearchInput!.value.trim()) {
    state.voiceSearchClear.style.display = 'none';
    (state.voiceSearchClear as any).disabled = true;
    state.voiceSearchClear.style.pointerEvents = 'none';
  } else {
    state.voiceSearchClear.style.display = 'flex';
    (state.voiceSearchClear as any).disabled = false;
    state.voiceSearchClear.style.pointerEvents = 'auto';
  }
}

export function setVoicePanelCollapsed(collapsed: any) {
  if (!state.voiceSelectorEl || !state.voicePanelToggle) return;
  state.voiceSelectorEl.classList.toggle('voice-selector--collapsed', !!collapsed);
  const useEl = state.voicePanelToggle.querySelector('use') as any;
  if (useEl) useEl.setAttribute('href', collapsed ? '#icon-voice-panel-down' : '#icon-voice-panel-up');
  state.voicePanelToggle.title = i18n(collapsed ? 'expand' : 'minimize');
  state.voicePanelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  saveSettings();
}

export function disableButtons(disable: any) {
  state.isLoading = disable;
  if (disable) {
    // Disable all player buttons except stop (user should be able to stop at any time)
    (state.playPauseBtn as any).disabled = true;
    (state.prevBtn as any).disabled = true;
    (state.nextBtn as any).disabled = true;

    // Only disable stop button if there's no active playback
    // If there's active playback (isPlaying || isPaused), keep stop enabled
    const hasActivePlayback = state.sentencePlayer && (state.sentencePlayer.isPlaying || state.sentencePlayer.isPaused);
    if (!hasActivePlayback) {
      (state.stopBtn as any).disabled = true;
    }

    // Disable all inputs during loading
    (state.voiceSearchInput as any).disabled = true;
    (state.speedSelect as any).disabled = true;
    setInlineCheckboxesDisabled(true);
    updateClearButton();
  } else {
    // Re-enable inputs (textContent is always enabled as it's read-only)

    // Update button states (will handle voice/auto-detect/speed based on playback state)
    updateButtonStates();
  }
}

export function updateStatusText(text: string, statusKey: any = null) {
  if (state.statusText) {
    // If statusKey is provided, use it; otherwise try to determine from text
    let key = statusKey;
    if (!key && text) {
      // Try to match text to a status key
      const statusMap: Record<string, string> = {
        Ready: 'ready',
        Playing: 'playing',
        Paused: 'paused',
        Stopped: 'stopped',
        'Loading voices...': 'loading_voices',
        'Select text to start': 'select_text_to_start',
        'Loading audio...': 'loading_audio',
      };
      key = statusMap[text] || null;
    }

    // Use i18n if we have a key, otherwise use text directly
    const displayText = key ? i18n(key) : text || i18n('ready');
    state.statusText.textContent = displayText;

    // Store the status key for language switching
    if (key) {
      state.statusText.setAttribute('data-status-key', key);
    }
  }
}

export function resetPlayerState() {
  (state.playPauseBtn as any).disabled = false;
  (state.stopBtn as any).disabled = true;
  (state.clearBtn as any).disabled = false; // Always enabled
  (state.prevBtn as any).disabled = true;
  (state.nextBtn as any).disabled = true;

  // Reset play/pause button to play state
  const btnIconUse = state.playPauseBtn!.querySelector('.btn-icon use') as any;
  btnIconUse.setAttribute('href', '#icon-play');
  state.playPauseBtn!.className = 'btn btn-primary btn-round';
  state.playPauseBtn!.title = 'Play';

  // Re-enable voice selection, auto-detect and speed
  (state.voiceSearchInput as any).disabled = false;
  (state.speedSelect as any).disabled = false;
  setInlineCheckboxesDisabled(false);
  updateClearButton();

  // Reset time progress
  const timeProgressEl = getWidgetElementById('time-progress') as any;
  if (timeProgressEl) {
    timeProgressEl.textContent = '0:00 / 0:00';
    timeProgressEl.classList.add('hidden');
  }

  // Reset voice tracking
  state.currentVoice = null;

  updateStatusText('Ready');
  updatePlayButtonState();
  // Re-sync hover tooltips: this path enables inputs without updateButtonStates(),
  // so listeners from playback would otherwise stay attached and show the wrong hint.
  setupDisabledTooltips();
}

export function showLoading(show: any, message: any = null) {
  state.isLoading = show;
  if (show) {
    updateStatusText(message || i18n('loading_audio'), message ? null : 'loading_audio');
  }
  updatePlayButtonState();
}

export function showError(message: any) {
  const errorText = state.errorMessage!.querySelector('.error-text') as any;
  if (errorText) {
    errorText.textContent = message;
  } else {
    state.errorMessage!.textContent = message;
  }
  state.errorMessage!.classList.remove('warning');
  state.errorMessage!.classList.remove('hidden');
}

export function hideError() {
  state.errorMessage!.classList.add('hidden');
  state.errorMessage!.classList.remove('warning');
}
