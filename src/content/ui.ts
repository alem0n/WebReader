/** ui (migrated from content.js) */
import { applyParentheticalFilter } from './utils';
import { SentencePlayer } from '../shared/sentence-player';
import { getWidget, getWidgetElementById } from './widget';
import { state } from './state';
import { i18n } from './i18n';
import { saveSettings } from './settings';
import { TOGGLE_SETTINGS, type ToggleKey } from '../shared/toggle-settings';
import { createContentLogger } from './log';

const logger = createContentLogger('ui');

export function showPlayerScreenInWidget() {
  if (state.authContainer) state.authContainer.style.display = 'none';
  if (state.playerContainer) state.playerContainer.style.display = 'block';
  if (state.apiKeyContainer) state.apiKeyContainer.style.display = 'none';
  if (state.authCheckInterval) {
    clearInterval(state.authCheckInterval);
    state.authCheckInterval = null;
  }
  getWidget()?.classList.remove('auth-mode');
}

export function showApiKeyScreenInWidget() {
  if (state.playerContainer) state.playerContainer.style.display = 'none';
  if (state.apiKeyContainer) state.apiKeyContainer.style.display = 'block';
  getWidget()?.classList.add('auth-mode');
}

export async function checkApiKeyStatusForWidget() {
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkApiKeyStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
    return result || { hasKey: false };
  } catch (error) {
    logger.error('Failed to check API key status:', error);
    return { hasKey: false };
  }
}

export function setupApiKeyUIInWidget() {
  // 配置统一在插件主界面完成，悬浮窗内无需绑定保存逻辑
}

export function dragStart(e: any) {
  // Don't drag if clicking on interactive elements
  if (
    (e.target as any).closest('button') ||
    (e.target as any).closest('input') ||
    (e.target as any).closest('select') ||
    (e.target as any).closest('label') ||
    (e.target as any).closest('.dropdown-list') ||
    (e.target as any).closest('.voice-option') ||
    (e.target as any).closest('.btn') ||
    (e.target as any).closest('.text-content') ||
    (e.target as any).closest('.user-menu')
  ) {
    return;
  }

  state.initialX = e.clientX - state.xOffset;
  state.initialY = e.clientY - state.yOffset;
  state.isDragging = true;
  getWidget()?.classList.add('dragging');
}

export function drag(e: any) {
  if (state.isDragging) {
    e.preventDefault();
    state.currentX = e.clientX - state.initialX;
    state.currentY = e.clientY - state.initialY;

    state.xOffset = state.currentX;
    state.yOffset = state.currentY;

    setTranslate(state.currentX, state.currentY, getWidget());
  }
}

export function dragEnd(_e: any) {
  state.initialX = state.currentX;
  state.initialY = state.currentY;
  state.isDragging = false;
  getWidget()?.classList.remove('dragging');
}

function setTranslate(xPos: any, yPos: any, el: any) {
  // Preserve scale if minimized
  const currentTransform = el.style.transform || '';
  const scaleMatch = currentTransform.match(/scale\([^)]+\)/);
  const scale = scaleMatch ? ' ' + scaleMatch[0] : '';
  el.style.transform = `translate(${xPos}px, ${yPos}px)${scale}`;
}

function formatTime(seconds: any) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function estimateTotalDuration(text: string, speed: number) {
  const words = text.split(/\s+/).length;
  const baseWPM = 150; // words per minute
  const minutes = words / baseWPM;
  return (minutes * 60) / speed; // seconds
}

export function updateTimeProgress(currentTime: any, _duration: any) {
  const timeProgressEl = getWidgetElementById('time-progress') as any;
  if (!timeProgressEl) return;

  if (state.sentencePlayer && state.sentencePlayer.isPlaying) {
    // Calculate total elapsed time (previous chunks + current position)
    const totalCurrentTime = state.totalElapsedTime + currentTime;

    // Estimate total duration for all sentences
    const allText = state.sentencePlayer.sentences.join(' ');
    const totalDuration = estimateTotalDuration(allText, state.playbackSpeed);

    const currentFormatted = formatTime(totalCurrentTime);
    const durationFormatted = formatTime(totalDuration);
    timeProgressEl.textContent = `${currentFormatted} / ${durationFormatted}`;
    timeProgressEl.classList.remove('hidden');
  } else {
    timeProgressEl.classList.add('hidden');
  }
}

/**
 * 构建带高亮句与段落分隔的展示 HTML（段落分隔语义同 SentencePlayer.getDisplaySeparatorAfter）。
 *
 * 抽出公共函数供首句高亮与播放中高亮共用，保证两处渲染逐句一致。
 */
function buildHighlightHtml(sentences: string[], paragraphBreakAfterIndex: Set<number>, highlightIndex: number): string {
  let html = '';
  for (let i = 0; i < sentences.length; i++) {
    if (i === highlightIndex) {
      html += `<span class="highlight">${escapeHtml(sentences[i])}</span>`;
    } else {
      html += escapeHtml(sentences[i]);
    }
    if (i < sentences.length - 1) {
      html += paragraphBreakAfterIndex.has(i) ? '\n\n' : ' ';
    }
  }
  return html;
}

export function highlightFirstSentenceIfNeeded() {
  if (!state.textContent) return;

  // 整页规范路径：直接用规范句子表高亮首句，与实际播放逐句一致（不二次切分）
  const map = state.pageTextMap;
  if (map && map.sentences.length > 0) {
    state.textContent.innerHTML = buildHighlightHtml(map.sentences, map.paragraphBreakAfterIndex, 0);
    logger.debug('First sentence highlighted (canonical map)');
    return;
  }

  // 旧路径：从文本框现切（选中朗读 / 粘贴 等无 DOM 映射场景）
  const text = applyParentheticalFilter((state.textContent.textContent || state.textContent.innerText || '').trim());

  // Only highlight if there's text and no playback is active
  if (text && state.sentencePlayer && (!state.sentencePlayer.isPlaying || state.sentencePlayer.isPaused)) {
    // Split text into sentences (paragraph breaks preserved in tempPlayer)
    const tempPlayer = new SentencePlayer();
    tempPlayer.setText(text);

    if (tempPlayer.sentences.length > 0) {
      state.textContent.innerHTML = buildHighlightHtml(tempPlayer.sentences, tempPlayer.paragraphBreakAfterIndex, 0);
      logger.debug('First sentence highlighted');
    }
  }
}

export function updateTextHighlight(sentenceIndex: number) {
  if (!state.sentencePlayer || !state.textContent) return;

  const sentences = state.sentencePlayer.sentences;
  if (sentences.length === 0) return;

  state.textContent.innerHTML = buildHighlightHtml(sentences, state.sentencePlayer.paragraphBreakAfterIndex, sentenceIndex);

  // Note: Auto-scroll is now only done when a new chunk starts (in playSentenceChunk)
  // This allows users to manually scroll without interruption during playback
}

export function escapeHtml(text: string) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
    if (typeof updateClearButton === 'function') updateClearButton();
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
    if (typeof updateClearButton === 'function') updateClearButton();

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
  if (typeof updateClearButton === 'function') updateClearButton();

  // Setup tooltips for disabled elements and voice search
  setupDisabledTooltips();
}

export function setupDisabledTooltips() {
  // Remove old handlers
  state.tooltipHandlers.forEach(({ element, enter, leave }) => {
    element.removeEventListener('mouseenter', enter);
    element.removeEventListener('mouseleave', leave);
  });
  state.tooltipHandlers = [];

  // Tooltip for voice search
  state.voiceSearchInput = getWidgetElementById('voice-search') as any;
  if (state.voiceSearchInput && (state.voiceSearchInput as any).disabled) {
    const dropdownContainer = state.voiceSearchInput.closest('.dropdown-container');
    const targetElement = dropdownContainer || state.voiceSearchInput;
    const showHandler = (e: any) => showTooltip(e, targetElement);
    const hideHandler = hideTooltip;
    targetElement.addEventListener('mouseenter', showHandler);
    targetElement.addEventListener('mouseleave', hideHandler);
    state.tooltipHandlers.push({ element: targetElement as HTMLElement, enter: showHandler, leave: hideHandler });
  }

  // Tooltip for speed select
  state.speedSelect = getWidgetElementById('speed-select') as any;
  if (state.speedSelect && (state.speedSelect as any).disabled) {
    const showHandler = (e: any) => showTooltip(e, state.speedSelect);
    const hideHandler = hideTooltip;
    state.speedSelect.addEventListener('mouseenter', showHandler);
    state.speedSelect.addEventListener('mouseleave', hideHandler);
    state.tooltipHandlers.push({ element: state.speedSelect, enter: showHandler, leave: hideHandler });
  }

  // Tooltip for checkboxes（开关数据驱动渲染后统一在 toggleCheckboxes 中；渲染前调用则空表跳过）
  for (const cb of Object.values(state.toggleCheckboxes)) {
    if (!(cb as any).disabled) continue;
    const checkboxLabel = cb.closest('.checkbox-label');
    if (!checkboxLabel) continue;
    const showHandler = (e: any) => showTooltip(e, checkboxLabel);
    const hideHandler = hideTooltip;
    checkboxLabel.addEventListener('mouseenter', showHandler);
    checkboxLabel.addEventListener('mouseleave', hideHandler);
    state.tooltipHandlers.push({ element: checkboxLabel as HTMLElement, enter: showHandler, leave: hideHandler });
  }
}

function showTooltip(_e: any, element: any, customText: any = null) {
  if (state.currentTooltip) {
    hideTooltip();
  }

  if (!element) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'tts-tooltip';
  tooltip.textContent = customText || i18n('click_stop_to_enable');
  const root = window.ttsWidgetShadowRoot || document.body;
  root.appendChild(tooltip);

  const rect = element.getBoundingClientRect();
  tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
  tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';

  // Adjust if tooltip goes off screen
  setTimeout(() => {
    if (parseInt(tooltip.style.left) < 10) {
      tooltip.style.left = rect.left + 'px';
    }
    if (parseInt(tooltip.style.left) + tooltip.offsetWidth > window.innerWidth - 10) {
      tooltip.style.left = rect.right - tooltip.offsetWidth + 'px';
    }
    tooltip.classList.add('show');
  }, 10);

  state.currentTooltip = { element, tooltip };
}

function hideTooltip() {
  if (state.currentTooltip && (state.currentTooltip as any).tooltip) {
    (state.currentTooltip as any).tooltip.remove();
    state.currentTooltip = null;
  }
}

export function updatePlayButtonState() {
  logger.debug('updatePlayButtonState called');
  const text = (state.textContent!.textContent || state.textContent!.innerText || '').trim();
  const hasText = text.length > 0;
  const hasVoiceOrAutoDetect = state.selectedVoice !== null || state.autoDetectLanguage;
  const shouldEnable = hasText && hasVoiceOrAutoDetect && !state.isLoading;

  (state.playPauseBtn as any).disabled = !shouldEnable;

  // Debug logging
  if (!shouldEnable) {
    logger.debug('Play button disabled because:', {
      hasText,
      textLength: text.length,
      selectedVoice: state.selectedVoice?.name || null,
      autoDetectLanguage: state.autoDetectLanguage,
      hasVoiceOrAutoDetect,
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
    if (typeof updateClearButton === 'function') updateClearButton();
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
  if (typeof updateClearButton === 'function') updateClearButton();

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
