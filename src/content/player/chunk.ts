/**
 * 单句播放循环：MiMo（Web Audio 管线）与本地音色容灾两条路径。
 *
 * playSentenceChunk 是「播放第 i 句」的公共入口：取缓存音频 → 塞给 Web Audio
 * 播放器 → onended 递归下一句；合成失败（重试用尽 / 未配置 Key / 网络失败）时
 * 切换本地音色容灾（playSentenceLocal），朗读不中断。
 *
 * 本地容灾路径独立于 Web Audio 管线：utterance 是 fire-and-forget，由 onEnd
 * 承接 currentIndex 推进与结束，状态机（isPlaying / isPaused / 停止）与
 * MiMo 路径一致。容灾标志存于 state.localFallbackActive，新建播放 / 停止 /
 * 清空时重置，恢复网络或填好 Key 后重新播放自动回到 MiMo。
 */
import type { PresetVoice } from '../../shared/types';
import { state } from '../state';
import { showError, updateButtonStates, updateTimeProgress, updateStatusText } from '../ui';
import * as localTts from '../../shared/local-tts';
import { limitFloat } from '../../shared/utils';
import { createContentLogger } from '../log';
import { onSentenceChanged } from './entire-page';
import { handleStop } from './stop-clear';

const logger = createContentLogger('player');

export async function playSentenceChunk(voice: PresetVoice, sentenceIndex: number | null = null) {
  // Use provided index or fall back to currentIndex
  if (sentenceIndex === null) {
    sentenceIndex = state.sentencePlayer ? state.sentencePlayer.currentIndex : 0;
  }

  if (!state.sentencePlayer || sentenceIndex >= state.sentencePlayer.sentences.length || sentenceIndex < 0) {
    // Playback complete
    handleStop();
    return;
  }

  // Update currentIndex to match the sentence we're about to play
  state.sentencePlayer.currentIndex = sentenceIndex;

  const sentenceText = state.sentencePlayer.sentences[sentenceIndex];
  const trimmed = (sentenceText || '').trim();
  const hasSpeakableContent = trimmed.length > 0 && /[\p{L}\d]/u.test(trimmed);
  if (!hasSpeakableContent) {
    // Skip empty or punctuation-only sentence, play next
    await playSentenceChunk(voice, sentenceIndex + 1);
    return;
  }

  // 本地容灾路径：MiMo 不可用时改用 speechSynthesis 逐句朗读，独立于 Web Audio 管线
  if (state.localFallbackActive) {
    playSentenceLocal(voice, sentenceIndex);
    return;
  }

  try {
    // 从缓存队列获取音频（如果未缓存则等待生产者合成）
    const audioBlob = await state.audioCacheManager!.ensure(sentenceIndex, () => state.isCancelled);
    if (state.isCancelled || !audioBlob) return;

    if (state.isCancelled) return;

    const audioUrl = URL.createObjectURL(audioBlob);
    state.sentencePlayer.addAudioUrl(audioUrl);

    state.audioPlayer!.src = audioUrl;
    state.currentChunkStartTime = state.totalElapsedTime;
    state.currentVoice = voice;
    updateButtonStates();
    state.currentChunkInfo = {
      chunkStartIndex: sentenceIndex,
      chunkSize: 1,
      sentencePositions: [{ index: sentenceIndex, startRatio: 0, endRatio: 1 }],
    };

    const timeUpdateHandler = () => {
      if (!state.audioPlayer || !state.sentencePlayer || !state.sentencePlayer.isPlaying) return;
      updateTimeProgress(state.audioPlayer.currentTime, state.audioPlayer.duration);
    };
    onSentenceChanged(sentenceIndex);
    state.audioPlayer!.addEventListener('timeupdate', timeUpdateHandler);

    if (!state.sentencePlayer.isPlaying) {
      logger.debug('Player was stopped during loading, aborting playback');
      state.audioPlayer!.removeEventListener('timeupdate', timeUpdateHandler);
      return;
    }

    state.currentPlayRequestId++;
    const thisPlayRequestId = state.currentPlayRequestId;

    try {
      await state.audioPlayer!.play();
      if (state.currentPlayRequestId !== thisPlayRequestId) {
        logger.debug(`Play request ${thisPlayRequestId} was superseded`);
        state.audioPlayer!.pause();
        state.audioPlayer!.removeEventListener('timeupdate', timeUpdateHandler);
        return;
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.message.includes('interrupted')) {
        logger.debug(`Play was interrupted (request ${thisPlayRequestId}), this is expected`);
        state.audioPlayer!.removeEventListener('timeupdate', timeUpdateHandler);
        return;
      }
      throw error;
    }

    state.audioPlayer!.onended = async () => {
      state.audioPlayer!.removeEventListener('timeupdate', timeUpdateHandler);
      state.currentChunkInfo = null;
      if (state.audioPlayer!.duration && !isNaN(state.audioPlayer!.duration)) {
        state.totalElapsedTime += state.audioPlayer!.duration;
      }
      if (state.sentencePlayer && state.sentencePlayer.isPlaying && !state.sentencePlayer.isPaused) {
        const nextIndex = sentenceIndex + 1;
        if (nextIndex < state.sentencePlayer.sentences.length) {
          // 更新缓存生产者的当前位置，让其从新位置继续填充
          state.audioCacheManager!.setCurrentIndex(nextIndex);
          await playSentenceChunk(voice, nextIndex);
        } else {
          handleStop();
        }
      }
    };
  } catch (error) {
    // MiMo 合成失败（重试已用尽 / 未配置 Key / 网络失败）：切换本地音色容灾，朗读不中断。
    // isCancelled 时 ensure 返回 null 而非抛错，不会走到这里，故无需额外判空。
    if (state.isCancelled) return;
    logger.warn('MiMo 合成失败，切换本地音色容灾：', error);
    state.localFallbackActive = true;
    // 停止缓存生产者：本地路径不再需要预取，避免无谓的 MiMo 请求
    state.audioCacheManager?.stop();
    if (!localTts.canSpeak()) {
      // 本地音色也不可用：提示并完整停止（handleStop 会重置标志与界面状态）
      state.localFallbackActive = false;
      showError('MiMo 合成失败，且浏览器不支持本地音色，请检查 API Key 或网络后重试。');
      handleStop();
      return;
    }
    playSentenceLocal(voice, sentenceIndex);
  }
}

/**
 * 本地音色容灾朗读：MiMo 失败后改用 speechSynthesis 逐句朗读。
 */
function playSentenceLocal(voice: PresetVoice, sentenceIndex: number): void {
  const player = state.sentencePlayer;
  if (!player) return;
  const text = player.sentences[sentenceIndex] || '';

  // 高亮 / 滚动 / 网页内高亮，与 MiMo 路径一致
  onSentenceChanged(sentenceIndex);
  updateStatusText('本地音色朗读中…（MiMo 不可用，可在主界面检查 API Key）', 'playing');
  updateButtonStates();

  // 语速映射到 speechSynthesis rate（界面档位 0.5–2.5 落在合法区间内，钳制兜底）
  // 语言跟随当前音色（单一来源）：不再按正文检测，与 MiMo 路径用同一个音色语言
  const rate = limitFloat(state.playbackSpeed, 0.1, 10);
  const lang = voice.language || 'en-US';

  const started = localTts.speak(text, lang, {
    rate,
    onEnd: () => {
      if (state.isCancelled || !player.isPlaying || player.isPaused) return;
      const nextIndex = sentenceIndex + 1;
      if (nextIndex < player.sentences.length) {
        state.audioCacheManager?.setCurrentIndex(nextIndex);
        void playSentenceChunk(voice, nextIndex);
      } else {
        handleStop();
      }
    },
  });

  if (!started) {
    // 本地音色也不可用：提示并停止，避免无限循环
    showError('MiMo 合成失败，且本地音色不可用，请检查 API Key 或网络后重试。');
    handleStop();
  }
}
