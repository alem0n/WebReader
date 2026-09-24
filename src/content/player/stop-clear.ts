/**
 * 停止与清空。
 *
 * 两者都重置播放状态、拆除网页内高亮覆盖层并停掉本地容灾朗读；停止保留播放进度
 * 与时间统计（供恢复），清空则全部重置并清空文本框。本地容灾标志在停止 / 清空时
 * 复位，恢复网络或填好 Key 后重新播放自动回到 MiMo。
 */
import { state } from '../state';
import { i18n } from '../i18n';
import { updateStatusText, updateButtonStates, resetPlayerState } from '../ui';
import { getWidgetElementById } from '../widget';
import { clearReadingOverlay } from '../reading-overlay';
import * as localTts from '../../shared/local-tts';

export function handleStop() {
  // Set cancellation flag to stop any ongoing requests
  state.isCancelled = true;

  // 停止本地容灾朗读并重置标志
  localTts.cancel();
  state.localFallbackActive = false;

  // 移除网页内逐句高亮，还原页面原文（句子映射保留，供暂停后续播复用）
  clearReadingOverlay();

  if (state.audioPlayer) {
    state.audioPlayer.pause();
    state.audioPlayer.currentTime = 0;
    state.audioPlayer.removeAttribute('src');
    state.audioPlayer.load();
  }

  if (state.sentencePlayer) {
    state.sentencePlayer.isPlaying = false;
    state.sentencePlayer.isPaused = false;
    // DON'T reset currentIndex - keep progress for resume
    state.sentencePlayer.cleanup();
  }

  if (state.audioCacheManager) state.audioCacheManager.clear();
  state.currentChunkInfo = null;

  // Don't reset time tracking - keep for resume
  // totalElapsedTime and currentChunkStartTime remain unchanged

  // Reset loading state
  state.isLoading = false;

  // Reset voice tracking
  state.currentVoice = null;

  // Hide time progress
  const timeProgressEl = getWidgetElementById('time-progress') as any;
  if (timeProgressEl) {
    timeProgressEl.classList.add('hidden');
  }

  // Restore text without highlighting (preserve paragraph breaks)
  if (state.textContent && state.sentencePlayer && state.sentencePlayer.sentences.length > 0) {
    state.textContent.textContent = state.sentencePlayer.getDisplayText();
  }

  updateStatusText(i18n('stopped'), 'stopped');
  updateButtonStates();
}

export function handleClear() {
  // Set cancellation flag to stop any ongoing requests
  state.isCancelled = true;

  // 停止本地容灾朗读并重置标志
  localTts.cancel();
  state.localFallbackActive = false;

  // 移除网页内逐句高亮并作废整页句子映射
  clearReadingOverlay();
  state.pageTextUnits = null;
  state.pageTextMap = null;

  if (state.audioPlayer) {
    state.audioPlayer.pause();
    state.audioPlayer.currentTime = 0;
    state.audioPlayer.removeAttribute('src');
    state.audioPlayer.load();
  }

  if (state.sentencePlayer) {
    state.sentencePlayer.isPlaying = false;
    state.sentencePlayer.isPaused = false;
    state.sentencePlayer.reset();
  }

  // Clear everything including cache
  if (state.audioCacheManager) state.audioCacheManager.clear();
  state.currentChunkInfo = null;

  // Reset time tracking
  state.totalElapsedTime = 0;
  state.currentChunkStartTime = 0;

  // Reset loading state
  state.isLoading = false;

  // Clear text content
  if (state.textContent) {
    state.textContent.textContent = '';
  }

  updateStatusText('Ready');
  resetPlayerState();
}
