/**
 * 开始播放：暂停 / 恢复 / 新播放三态判定，以及新播放的完整启动序列。
 *
 * 「规范路径」自检：文本框内容与整页规范句子表的镜像文本完全一致时，直接灌入
 * 预构建句子表，不再二次切分 —— 保证「第 i 句」与网页内跟读显示回指的 DOM 单元
 * 逐句一致。用户手改文本框 / 粘贴 / 选中朗读等场景自检不成立，自动作废映射并
 * 回退到旧 setText 路径。
 *
 * 本地音色模式（state.localFallbackActive）下，暂停 / 恢复走 speechSynthesis，
 * 与 Web Audio 管线分开处理。
 */
import { state } from '../state';
import { i18n } from '../i18n';
import { showLoading, showError, hideError, updateStatusText, updateButtonStates, disableButtons, resetPlayerState } from '../ui';
import { AudioCacheManager } from '../../shared/audio-cache';
import { detectLanguage } from '../../shared/detect-language';
import { reloadToggleSettings, readTtsProvider } from '../settings';
import { formatVoiceName } from '../voices';
import { applyParentheticalFilter } from '../utils';
import { getDisplayTextFromMap } from '../sentence-map';
import { prepareReadingOverlay, clearReadingOverlay } from '../reading-overlay';
import * as localTts from '../../shared/local-tts';
import { createContentLogger } from '../log';
import { refreshMapIfStale } from './entire-page';
import { playSentenceChunk } from './chunk';

const logger = createContentLogger('player');

export async function handlePlayPause() {
  // 本地音色模式：暂停 / 恢复走 speechSynthesis（Web Audio 管线无 src，需单独处理）
  if (state.localFallbackActive && state.sentencePlayer && state.sentencePlayer.isPlaying) {
    if (state.sentencePlayer.isPaused) {
      state.sentencePlayer.isPaused = false;
      localTts.resume();
      updateStatusText(i18n('playing'), 'playing');
    } else {
      localTts.pause();
      state.sentencePlayer.isPaused = true;
      updateStatusText(i18n('paused'), 'paused');
    }
    updateButtonStates();
    return;
  }

  // If paused and audio exists, resume playback
  if (state.sentencePlayer && state.sentencePlayer.isPaused && state.audioPlayer && state.audioPlayer.paused) {
    state.sentencePlayer.isPaused = false;
    await state.audioPlayer.play();
    updateStatusText(i18n('playing'), 'playing');
    updateButtonStates();
    return;
  }

  // If playing, pause
  if (
    state.sentencePlayer &&
    state.sentencePlayer.isPlaying &&
    !state.sentencePlayer.isPaused &&
    state.audioPlayer &&
    !state.audioPlayer.paused
  ) {
    state.audioPlayer.pause();
    state.sentencePlayer.isPaused = true;
    updateStatusText(i18n('paused'), 'paused');
    updateButtonStates();
    return;
  }

  // Otherwise, start new playback
  // 读入 popup 主界面修改的开关型配置：对「正在朗读」不生效，仅本次新朗读生效
  await reloadToggleSettings();

  const rawText = (state.textContent!.textContent || state.textContent!.innerText || '').trim();

  const map = state.pageTextMap;
  // 「规范路径」自检：文本框内容与整页规范句子表的镜像文本完全一致时，直接灌入预构建
  // 句子表，不再二次切分 —— 保证「第 i 句」与网页内跟读显示回指的 DOM 单元逐句一致。
  // 用户手改文本框 / 粘贴 / 选中朗读等场景自检不成立，自动作废映射并回退到旧 setText 路径。
  const useCanonical = !!(map && map.sentences.length > 0 && getDisplayTextFromMap(map) === rawText);
  if (!useCanonical) {
    state.pageTextUnits = null;
    state.pageTextMap = null;
  }

  // 先按开关删除括号内容，再进行语音转换（规范路径的句子已在映射层按段过滤过）
  const text = useCanonical ? rawText : applyParentheticalFilter(rawText);

  if (!text) {
    showError(i18n('please_add_text'));
    return;
  }

  try {
    hideError();

    let voiceToUse = state.selectedVoice;
    if (state.autoDetectLanguage) {
      const detectedLang = detectLanguage(text);
      // 检测为空（如拉丁短文本）时按脚本回退：含汉字→中文，否则英文
      const langToUse = detectedLang || (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text) ? 'zh-CN' : 'en-US');
      if (langToUse) {
        const langPrefix = langToUse.split('-')[0];
        const voicesForLang = state.allVoices.filter(
          (v) =>
            v.language &&
            (v.language === langToUse ||
              v.language.startsWith(langToUse + '-') ||
              (v.language.startsWith(langPrefix + '-') && !v.language.startsWith('fil-')))
        );
        if (voicesForLang.length > 0) {
          voiceToUse = voicesForLang[0];
          logger.debug(
            `Using language: ${langToUse} (${detectedLang ? 'auto-detected' : 'interface fallback for short text'}), voice: ${voiceToUse.name}`
          );

          if (state.voiceSearchInput) {
            state.voiceSearchInput.value = formatVoiceName(voiceToUse);
          }
        } else if (state.allVoices.length > 0) {
          // 检测到的语言没有匹配音色（MiMo 仅提供中英文音色），回退到默认音色（支持中英文）
          voiceToUse = state.allVoices.find((v) => v.voice === 'mimo_default') || state.allVoices[0];
          logger.debug(`Using language: ${langToUse} has no matching voice, falling back to: ${voiceToUse.name}`);
          if (state.voiceSearchInput) {
            state.voiceSearchInput.value = formatVoiceName(voiceToUse);
          }
        }
      }
    }

    if (!voiceToUse) {
      showError(i18n('please_select_voice'));
      return;
    }

    showLoading(true, 'Loading audio...');
    disableButtons(true);

    // Clear old cache manager and chunk info
    if (state.audioCacheManager) state.audioCacheManager.clear();
    state.audioCacheManager = new AudioCacheManager(5);
    state.currentChunkInfo = null;

    // Reset total elapsed time for new playback
    state.totalElapsedTime = 0;
    state.currentChunkStartTime = 0;

    // Reset cancellation flag at the start of new playback
    state.isCancelled = false;
    // 新一次播放重新尝试 MiMo（上一会话的本地容灾标志作废，网络 / Key 恢复后自动回到 MiMo）
    state.localFallbackActive = false;

    // Set current voice for prefetching
    state.currentVoice = voiceToUse;

    if (useCanonical && map) {
      // 采集与播放之间的窗口内页面可能已变化：用最新 DOM 重建映射，消除高亮失联
      refreshMapIfStale();
      const freshMap = state.pageTextMap ?? map;
      const freshUnits = state.pageTextUnits;
      state.sentencePlayer!.setSentences(freshMap.sentences, freshMap.paragraphBreakAfterIndex);
      // 准备网页内逐句高亮：把句子区间包进透明 span，原文保持原位
      if (state.inlineDisplayEnabled && freshUnits) {
        prepareReadingOverlay(freshUnits, freshMap);
      }
    } else {
      state.sentencePlayer!.setText(text);
    }
    state.sentencePlayer!.isPlaying = true;
    state.sentencePlayer!.isPaused = false;

    // 启动缓存生产者，从句子0开始维持5个缓存音频
    // provider 纳入缓存键，避免 MiMo 与 relay 同名音色错命中（plan.md P2）
    const provider = await readTtsProvider();
    state.audioCacheManager.start(state.sentencePlayer!.sentences, voiceToUse.name, state.playbackSpeed, 0, provider);

    await playSentenceChunk(voiceToUse);

    showLoading(false);
    updateStatusText(i18n('playing'), 'playing');
    updateButtonStates();
  } catch (error: any) {
    showLoading(false);
    showError(`Error: ${error.message}`);
    logger.error('Error playing audio:', error);
    // 播放失败：移除网页内高亮，避免残留 span 还挂在页面上（prepare 已在 try 内执行）
    clearReadingOverlay();
    resetPlayerState();
  }
}
