/** player (migrated from content.js) */
import { createWidget, getWidget, getWidgetElementById } from './widget';
import { removeHTMLTags, removeSquareBrackets } from './text-input';
import { extractPageText, type TextUnit } from './extractor';
import { collectPageForReading, getDisplayTextFromMap, type SentenceMap } from './sentence-map';
import { prepareReadingOverlay, highlightSentence, clearReadingOverlay } from './reading-overlay';
import { state } from './state';
import { i18n } from './i18n';
import type { PresetVoice } from '../shared/types';
import { AudioCacheManager } from '../shared/audio-cache';
import { detectLanguage } from '../shared/detect-language';
import { applyParentheticalFilter } from './utils';
import { reloadToggleSettings, readTtsProvider } from './settings';
import { formatVoiceName } from './voices';
import {
  showLoading,
  showError,
  hideError,
  updateStatusText,
  updateButtonStates,
  disableButtons,
  resetPlayerState,
  updateTimeProgress,
  updateTextHighlight,
  estimateTotalDuration,
  escapeHtml,
  highlightFirstSentenceIfNeeded,
} from './ui';
import { createContentLogger } from './log';
import { debounce, limitFloat } from '../shared/utils';
import * as localTts from '../shared/local-tts';

const logger = createContentLogger('player');

/**
 * 本地音色容灾标志：MiMo 合成失败（含未配置 Key / 网络失败）后置为 true，
 * 本次播放会话内改用 speechSynthesis 逐句朗读；新建播放 / 停止 / 清空时重置。
 */
let localFallbackActive = false;
function scrollToCurrentChunk(sentenceIndex: number) {
  // 网页内逐句高亮开启且存在句子映射时，页面级滚动由 reading-overlay 接管，不再滚动文本框
  if (state.inlineDisplayEnabled && state.pageTextMap) {
    return;
  }
  if (!state.textContent || !state.sentencePlayer) return;

  const totalSentences = state.sentencePlayer.sentences.length;
  if (totalSentences === 0 || sentenceIndex < 0 || sentenceIndex >= totalSentences) return;

  const highlightedElement = state.textContent.querySelector('.highlight') as any;

  if (highlightedElement) {
    const elRect = highlightedElement.getBoundingClientRect();
    const containerRect = state.textContent.getBoundingClientRect();
    const containerHeight = state.textContent.clientHeight;
    const PADDING = 40; // px of breathing room above the highlighted sentence

    const isTopVisible = elRect.top >= containerRect.top;
    const isBottomVisible = elRect.bottom <= containerRect.bottom;

    if (!isTopVisible || !isBottomVisible) {
      // Convert element top to a scrollTop value
      const elOffsetTop = highlightedElement.offsetTop;

      let targetScrollTop;
      if (elRect.height + PADDING <= containerHeight) {
        // Sentence fits entirely — scroll so the whole sentence is visible with padding
        if (!isTopVisible) {
          // Sentence is above: bring top into view with padding
          targetScrollTop = elOffsetTop - PADDING;
        } else {
          // Sentence is below or partially below: align bottom with container bottom + padding
          targetScrollTop = elOffsetTop + elRect.height - containerHeight + PADDING;
        }
      } else {
        // Sentence is taller than the container — just show the beginning
        targetScrollTop = elOffsetTop - PADDING;
      }

      state.textContent.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });

      logger.debug(`Scrolling to sentence ${sentenceIndex}`);
    }
  } else {
    // Fallback: proportional scroll if no highlight found
    const scrollRatio = sentenceIndex / totalSentences;
    const maxScroll = state.textContent.scrollHeight - state.textContent.clientHeight;
    state.textContent.scrollTo({
      top: maxScroll * scrollRatio,
      behavior: 'smooth',
    });
    logger.debug(`Fallback scroll to sentence ${sentenceIndex}/${totalSentences}`);
  }
}

/**
 * 采集当前页面的正文文本。
 *
 * 使用移植自 kiss-translator 的块级遍历识别算法（见 extractor.ts）：
 * 自顶向下把 DOM 拆成最小块级文本单元，忽略导航/页脚/脚本/本扩展自身 DOM，
 * 过滤 URL/数字等噪声，并按站点规则适配复杂页面。返回纯文本，段落以 \n\n
 * 分隔，直接交给 SentencePlayer.setText 逐句朗读。
 *
 * 方括号内容（如引用标记 [1]）不再在此强制移除，统一交给可开关的
 * 「删除括号内容」过滤（applyParentheticalFilter）在播放前处理，行为与设置一致。
 */
export function collectPageText() {
  return extractPageText();
}

/**
 * 一键朗读整页：识别正文 → 显示播放器 → 自动播放。
 *
 * 页面内「朗读整页」悬浮按钮的直接入口，无需先打开插件主界面：
 * 本地采集正文（不向任何服务器上传页面内容）→ 构建句子→DOM 映射 →
 * 确保悬浮窗存在并可见 → 等待初始化 → 填入文本 → 自动开始播放。
 * 朗读进度、暂停/停止、逐句导航全部复用悬浮窗，同时可把当前句子显示在网页上。
 */
export async function playEntirePage(): Promise<void> {
  // Google Docs 正文被遮挡，本地采集拿不到内容：统一弹警告引导用户改用粘贴，
  // 避免各调用方（FAB / popup 阅读整页 / 悬浮窗）各自重复判断
  if (
    typeof window.location !== 'undefined' &&
    typeof window.location.hostname === 'string' &&
    window.location.hostname.includes('docs.google.com')
  ) {
    await ensureWidgetVisible();
    showGoogleDocsWarning();
    return;
  }

  // 采集正文段落单元并构建规范句子表（与播放器同一切分管线，不二次切分）
  const { units, map } = collectPageForReading();

  // 无论有没有正文都弹出悬浮窗：无正文时走统一的错误提示，便于用户排查
  await ensureWidgetVisible();

  if (!map.sentences.length) {
    showError(i18n('no_text_found'));
    return;
  }

  // 先停止正在进行的播放（选中文字朗读 / 上一次整页朗读），
  // 否则 handlePlayPause 会命中「暂停」分支，新文本被填入却不播放。
  if (state.sentencePlayer?.isPlaying) {
    handleStop();
  }

  // 悬浮窗若停在 API Key 界面（尚未配置），先暂存正文：
  // 此时 playerContainer 被隐藏，填文本与自动播放都会落空，
  // 待用户配好 Key（apiKeySaved 广播到达）后自动消费（重新采集并朗读）。
  if (state.apiKeyContainer && state.apiKeyContainer.style.display !== 'none') {
    state.pendingPageText = getDisplayTextFromMap(map);
    logger.info('未配置 API Key，已暂存整页正文，配好后自动朗读');
    return;
  }

  state.pendingPageText = null;
  setPageTextAndAutoPlay(units, map);
}

/** 确保悬浮窗已创建并可见（与 playSelectedText 一致的处理方式） */
async function ensureWidgetVisible(): Promise<void> {
  let widget = getWidget();
  if (!widget) {
    createWidget();
    widget = getWidget();
  }
  if (widget) {
    widget.style.display = 'block';
  }
}

/**
 * 填入文本并自动播放（带重试，等待悬浮窗初始化完成）。
 *
 * 文本框填充为规范句子表的镜像文本，并把 units/map 存入 state，使 handlePlayPause
 * 的「规范路径」自检成立 —— 播放器直接复用预构建句子表，不二次切分，
 * 网页内跟读显示据此把每句话回指到正确的页面元素。
 */
function setPageTextAndAutoPlay(units: TextUnit[], map: SentenceMap, attempts = 0): void {
  state.textContent = getWidgetElementById('text-content') as any;
  state.playPauseBtn = getWidgetElementById('play-pause-btn') as any;

  if (state.textContent && state.playPauseBtn) {
    state.textContent.textContent = getDisplayTextFromMap(map);
    state.pageTextUnits = units;
    state.pageTextMap = map;

    setTimeout(() => {
      highlightFirstSentenceIfNeeded();
    }, 100);

    setTimeout(() => {
      const btn = getWidgetElementById('play-pause-btn') as any;
      if (btn && !btn.disabled) {
        btn.click();
      } else if (attempts < 10) {
        // 音色可能仍在加载，按钮还不可用，稍后重试
        setTimeout(() => setPageTextAndAutoPlay(units, map, attempts + 1), 300);
      }
    }, 500);
  } else if (attempts < 20) {
    // 悬浮窗尚未初始化完成，稍后重试
    setTimeout(() => setPageTextAndAutoPlay(units, map, attempts + 1), 100);
  }
}

/**
 * 句子切换的统一回调：悬浮窗高亮 + 文本框滚动 + 网页内逐句高亮。
 *
 * 播放、上一句、下一句三处调用点统一收敛到这里，保证网页高亮与音频同步。
 */
function onSentenceChanged(sentenceIndex: number): void {
  updateTextHighlight(sentenceIndex);
  scrollToCurrentChunk(sentenceIndex);
  showInlineForSentence(sentenceIndex);
}

/**
 * 采集（按钮点击）与播放（包裹 span）之间存在时间差，期间页面 DOM 可能被改动。
 *
 * 只用廉价的 isConnected 检测「元素已被替换 / 移除」（SPA 重渲染最常见、且是
 * wrapUnitSentences 无法自救的唯一情形：元素脱离文档时它只能整单元放弃）；
 * 命中时用当前 DOM 重新采集重建。仅当镜像文本与建表时完全一致（正文内容
 * 未变，仅位置 / 结构漂移）才替换，保证「第 i 句」仍与页面元素逐句对齐。
 *
 * 元素仍在文档中、仅文本节点漂移的情形由 wrapUnitSentences 逐单元重建区间
 * 兜底，不需要这里全量重读，避免静态页面的二次遍历开销。
 */
function refreshMapIfStale(): void {
  const units = state.pageTextUnits;
  const map = state.pageTextMap;
  if (!units || !map || !map.sentences.length) return;

  const detached = units.some((u) => !u.element.isConnected);
  if (!detached) return;

  const { units: newUnits, map: newMap } = collectPageForReading();
  if (!newMap.sentences.length) return;
  // 正文内容未变才接受新映射；否则保留旧映射，交给覆盖层逐单元兜底重建
  if (getDisplayTextFromMap(newMap) !== getDisplayTextFromMap(map)) {
    logger.debug('页面正文内容已变化，保留旧映射，由覆盖层逐单元兜底重建');
    return;
  }

  state.pageTextUnits = newUnits;
  state.pageTextMap = newMap;
  if (state.textContent) {
    state.textContent.textContent = getDisplayTextFromMap(newMap);
  }
  logger.debug('页面 DOM 已变化，已用最新 DOM 重建句子映射');
}

/**
 * 网页内高亮当前朗读句子（主开关关闭或无句子映射时静默跳过）。
 *
 * 映射不存在（选中朗读 / 粘贴等非整页场景）时不激活网页内高亮，
 * 这些场景没有 DOM 回指，文本框仍是唯一展示。
 */
function showInlineForSentence(sentenceIndex: number): void {
  if (!state.inlineDisplayEnabled) return;
  if (!state.pageTextMap) return;
  highlightSentence(sentenceIndex);
}

/**
 * 按当前开关与句子映射刷新网页内高亮覆盖层（供设置开关运行中切换调用）。
 *
 * 开启：重新包裹句子 span 并高亮当前句；关闭：拆除覆盖层、还原页面。
 * 未在播放或无句子映射时，仅保证页面无残留。
 */
export function refreshInlineReading(): void {
  if (!state.inlineDisplayEnabled) {
    clearReadingOverlay();
    return;
  }
  const map = state.pageTextMap;
  const units = state.pageTextUnits;
  if (!map || !units || !state.sentencePlayer) {
    clearReadingOverlay();
    return;
  }
  // 运行中切回开启时，页面可能已变化：先按最新 DOM 重建映射再包裹
  refreshMapIfStale();
  prepareReadingOverlay(state.pageTextUnits ?? units, state.pageTextMap ?? map);
  highlightSentence(state.sentencePlayer.currentIndex);
}

export async function handlePlayPause() {
  // 本地音色模式：暂停 / 恢复走 speechSynthesis（Web Audio 管线无 src，需单独处理）
  if (localFallbackActive && state.sentencePlayer && state.sentencePlayer.isPlaying) {
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

  // 「规范路径」自检：文本框内容与整页规范句子表的镜像文本完全一致时，直接灌入预构建
  // 句子表，不再二次切分 —— 保证「第 i 句」与网页内跟读显示回指的 DOM 单元逐句一致。
  // 用户手改文本框 / 粘贴 / 选中朗读等场景自检不成立，自动作废映射并回退到旧 setText 路径。
  const map = state.pageTextMap;
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
    localFallbackActive = false;

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
  if (localFallbackActive) {
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
    localFallbackActive = true;
    // 停止缓存生产者：本地路径不再需要预取，避免无谓的 MiMo 请求
    state.audioCacheManager?.stop();
    if (!localTts.canSpeak()) {
      // 本地音色也不可用：提示并完整停止（handleStop 会重置标志与界面状态）
      localFallbackActive = false;
      showError('MiMo 合成失败，且浏览器不支持本地音色，请检查 API Key 或网络后重试。');
      handleStop();
      return;
    }
    playSentenceLocal(voice, sentenceIndex);
  }
}

/**
 * 本地音色容灾朗读（plan.md 阶段 5）：MiMo 失败后改用 speechSynthesis 逐句朗读。
 *
 * 独立于 Web Audio 管线：utterance 是 fire-and-forget，由 onEnd 承接 currentIndex
 * 推进与结束，状态机（isPlaying / isPaused / 停止）与 MiMo 路径一致。
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
  const rate = limitFloat(state.playbackSpeed, 0.1, 10);
  // 语言：检测失败时按脚本回退（含汉字→中文，否则英文）
  const lang = detectLanguage(text) || (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text) ? 'zh-CN' : 'en-US');

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

export function handleStop() {
  // Set cancellation flag to stop any ongoing requests
  state.isCancelled = true;

  // 停止本地容灾朗读并重置标志
  localTts.cancel();
  localFallbackActive = false;

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

function showGoogleDocsWarning() {
  const errorText = state.errorMessage!.querySelector('.error-text') as any;
  if (errorText) {
    const raw = i18n('google_docs_instructions');
    const formatted = raw
      .split('\n')
      .map((line: string) => escapeHtml(line))
      .join('<br/>');

    errorText.innerHTML = `
        <div>${formatted}</div>
        <div class="warning-button-preview">
          <button class="btn btn-secondary btn-square btn-preview" type="button" title="${i18n('paste_from_clipboard')}">
            <svg class="btn-icon" width="22" height="22" aria-hidden="true">
              <use href="#icon-two-pages-play"></use>
            </svg>
          </button>
        </div>
      `;

    const previewBtn = errorText.querySelector('.warning-button-preview .btn-preview') as any;
    if (previewBtn) {
      previewBtn.addEventListener('click', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        handlePaste();
      });
    }
  } else {
    state.errorMessage!.textContent = i18n('google_docs_instructions');
  }
  state.errorMessage!.classList.add('warning');
  state.errorMessage!.classList.remove('hidden');
}

export function handleClear() {
  // Set cancellation flag to stop any ongoing requests
  state.isCancelled = true;

  // 停止本地容灾朗读并重置标志
  localTts.cancel();
  localFallbackActive = false;

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

/**
 * 跳到任意句子并从这里播放（上一句/下一句/网页点击跳转的公共入口）。
 *
 * 统一链路：停止当前播放 → 作废在途请求 → 立即移动并高亮目标句 →
 * 防抖 500ms 合成并播放。防抖 + navigationRequestId 天然处理快速连点。
 */

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

export async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      let cleanedText = removeHTMLTags(text);
      cleanedText = removeSquareBrackets(cleanedText);
      if (!cleanedText || !cleanedText.trim()) {
        showError(i18n('no_readable_text_found'));
        return;
      }
      if (state.sentencePlayer && state.sentencePlayer.isPlaying) {
        handleStop();
      }
      state.textContent!.textContent = '';
      state.textContent!.textContent = cleanedText.trim();
      // 粘贴内容与整页映射无关：作废规范路径，回退到 setText 切分
      state.pageTextUnits = null;
      state.pageTextMap = null;
      if (window.edgeTTSEnableAutoDetectIfNoVoice) {
        window.edgeTTSEnableAutoDetectIfNoVoice();
      }
      setTimeout(() => {
        if (state.playPauseBtn && !state.playPauseBtn.disabled) {
          logger.debug('Starting automatic playback...');
          state.playPauseBtn.click();
        } else {
          logger.debug('Play button disabled, cannot autoplay');
        }
      }, 300);
    } else {
      showError(i18n('clipboard_empty'));
    }
  } catch (error) {
    logger.error('Error reading clipboard:', error);
    showError(i18n('failed_to_read_clipboard'));
  }
}
