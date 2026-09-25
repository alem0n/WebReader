/**
 * 跳到任意句子并从这里播放（上一句/下一句/网页点击跳转的公共入口）。
 *
 * 统一链路：停止当前播放 → 作废在途请求 → 立即移动并高亮目标句 →
 * 防抖 500ms 合成并播放。防抖 + navigationRequestId 天然处理快速连点。
 */
import { state } from '../state';
import type { PresetVoice } from '../../shared/types';
import { showLoading, showError, updateButtonStates, estimateTotalDuration } from '../ui';
import { debounce } from '../../shared/utils';
import { detectLanguage } from '../../shared/detect-language';
import { createContentLogger } from '../log';
import { onSentenceChanged } from './entire-page';
import { playSentenceChunk } from './chunk';

const logger = createContentLogger('player');

/**
 * 防抖后实际执行「加载并播放目标句」的逻辑（由 jumpToSentence 以 500ms 防抖调用，
 * 快速连点只执行最后一次）。抽出为模块级函数，复用 shared/debounce 的取消语义。
 */
const navigateToSentenceDebounced = debounce(async (voice: PresetVoice, targetSentenceIndex: number, thisRequestId: number) => {
  // 防抖期间用户又点了一次，旧请求作废
  if (state.navigationRequestId !== thisRequestId) {
    logger.debug(`Request ${thisRequestId} cancelled, current is ${state.navigationRequestId}`);
    return;
  }

  logger.debug(`Debounce settled, loading audio for sentence ${targetSentenceIndex}`);

  // Calculate elapsed time up to the sentence we're jumping to
  state.totalElapsedTime = 0;
  if (targetSentenceIndex > 0) {
    const previousSentences = state.sentencePlayer!.sentences.slice(0, targetSentenceIndex).join(' ');
    state.totalElapsedTime = estimateTotalDuration(previousSentences, state.playbackSpeed);
  }

  // Show loading status
  showLoading(true, 'Loading audio...');
  state.isCancelled = false;
  // 更新缓存生产者位置，让其从跳转目标开始预加载
  if (state.audioCacheManager) state.audioCacheManager.setCurrentIndex(targetSentenceIndex);
  state.sentencePlayer!.isPlaying = true;
  state.sentencePlayer!.isPaused = false;
  updateButtonStates();

  try {
    // Double-check request is still valid before playing
    if (state.navigationRequestId !== thisRequestId) {
      logger.debug(`Request ${thisRequestId} cancelled before play`);
      showLoading(false);
      return;
    }

    // Ensure currentIndex matches target before playing
    state.sentencePlayer!.currentIndex = targetSentenceIndex;
    onSentenceChanged(targetSentenceIndex);

    await playSentenceChunk(voice, targetSentenceIndex);

    showLoading(false);
    updateButtonStates();
  } catch (error: any) {
    showLoading(false);
    showError(`Error: ${error.message}`);
    logger.error('Error playing audio:', error);
    updateButtonStates();
  }
}, 500);

export function jumpToSentence(targetSentenceIndex: number): void {
  if (!state.sentencePlayer || state.sentencePlayer.sentences.length === 0) return;
  if (targetSentenceIndex < 0 || targetSentenceIndex >= state.sentencePlayer.sentences.length) return;

  // Stop current playback and invalidate any pending play requests
  if (state.audioPlayer && !state.audioPlayer.paused) {
    state.audioPlayer.pause();
  }
  state.isCancelled = true; // Cancel any in-flight playSentenceChunk immediately
  state.currentPlayRequestId++; // Invalidate any pending play() calls

  // Increment request ID to invalidate any pending requests
  state.navigationRequestId++;

  // 立即移动到目标句并高亮（先于音频到位，反馈即时）
  state.sentencePlayer.currentIndex = targetSentenceIndex;
  logger.debug(`Moved to sentence ${targetSentenceIndex}`);
  onSentenceChanged(targetSentenceIndex);

  let voice = state.selectedVoice;
  if (state.autoDetectLanguage) {
    const text = (state.textContent!.textContent || state.textContent!.innerText || '').trim();
    const detectedLang = detectLanguage(text);
    if (detectedLang) {
      const langPrefix = detectedLang.split('-')[0];
      const voicesForLang = state.allVoices.filter(
        (v) =>
          v.language &&
          (v.language === detectedLang ||
            v.language.startsWith(detectedLang + '-') ||
            (v.language.startsWith(langPrefix + '-') && !v.language.startsWith('fil-')))
      );
      if (voicesForLang.length > 0) voice = voicesForLang[0];
    }
  }

  if (!voice) return;

  // Capture current request ID for this navigation
  const thisRequestId = state.navigationRequestId;

  // 500ms 防抖加载音频（快速连点只执行最后一次）
  navigateToSentenceDebounced(voice, targetSentenceIndex, thisRequestId);
}

export async function handlePrev() {
  if (!state.sentencePlayer || state.sentencePlayer.sentences.length === 0) return;
  if (state.sentencePlayer.currentIndex > 0) {
    jumpToSentence(state.sentencePlayer.currentIndex - 1);
  }
}

export async function handleNext() {
  if (!state.sentencePlayer || state.sentencePlayer.sentences.length === 0) return;
  if (state.sentencePlayer.currentIndex < state.sentencePlayer.sentences.length - 1) {
    jumpToSentence(state.sentencePlayer.currentIndex + 1);
  }
}
