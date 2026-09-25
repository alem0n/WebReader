/**
 * 播放器初始化：SentencePlayer、WebAudioPlayer 与播放状态联动。
 *
 * WebAudioPlayer 用 Web Audio API 播放，替代 HTMLAudioElement：
 * 页面 CSP（default-src 'self'，未设 media-src）会拦截 blob: 媒体 URL，
 * 导致 <audio> 报 "Failed to load because no supported source was found."；
 * Web Audio 在 JS 内解码播放，完全绕过页面 CSP。
 */
import { SentencePlayer } from '../../shared/sentence-player';
import { state } from '../state';
import { logger } from '../log';
import { WebAudioPlayer } from '../web-audio-player';
import { updateButtonStates, showError, resetPlayerState } from '../ui';
import { i18n } from '../i18n';

/** 播放状态默认值（停止 / 清空 / 新建播放时都会回到这里） */
export function initWidgetStateDefaults(): void {
  // State
  state.allVoices = [];
  state.filteredVoices = [];
  state.selectedVoice = null;
  state.audioPlayer = null;
  state.isLoading = false;
  state.isCollectPageLoading = false;
  state.isCancelled = false; // Flag to cancel ongoing requests when Clear/Stop is pressed
  state.currentChunkInfo = null; // Store current chunk info for navigation
  state.voiceSelectionIsManual = false; // 默认跟随界面语言，手选由存储恢复
  state.removeParentheticals = true; // 朗读前删除括号及其中的内容（可开关，默认开）
  state.playbackSpeed = 1.0;
  state.sentencePlayer = null;
  state.audioCacheManager = null; // AudioCacheManager: producer-consumer cache for TTS audio
  state.totalElapsedTime = 0; // Total elapsed time for all chunks
  state.currentChunkStartTime = 0; // Start time of current chunk playback
  state.currentVoice = null; // Current voice being used (for cache checking)
  state.navigationRequestId = 0; // Counter to track navigation requests and cancel outdated ones
  state.currentPlayRequestId = 0; // Counter to track play requests and cancel outdated ones

  // Initialize sentence player early
  state.sentencePlayer = new SentencePlayer();
  logger.debug('SentencePlayer created');

  // 拖拽位移状态（拖拽监听在 index 编排，此处只给初值）
  state.isDragging = false;
  state.currentX = 0;
  state.currentY = 0;
  state.initialX = 0;
  state.initialY = 0;
  state.xOffset = 0;
  state.yOffset = 0;

  // 提示与音色导航状态
  state.tooltipHandlers = [];
  state.currentTooltip = null;
  state.isUserTyping = false;
  state.highlightedIndex = -1; // Track keyboard navigation index
}

/** 创建 WebAudioPlayer 并把播放状态变化接到按钮状态 */
export function initAudioPlayer(): void {
  state.audioPlayer = new WebAudioPlayer();

  state.audioPlayer.addEventListener('play', () => {
    updateButtonStates();
  });

  state.audioPlayer.addEventListener('pause', () => {
    updateButtonStates();
  });

  state.audioPlayer.addEventListener('ended', () => {
    updateButtonStates();
  });

  state.audioPlayer.addEventListener('error', (e: any) => {
    const me = state.audioPlayer!.error;
    logger.error(
      'Audio error event:',
      e,
      'MediaError code =',
      me && (me as any).code,
      'msg =',
      me && (me as any).message,
      'src =',
      state.audioPlayer!.src
    );
    showError(i18n('error_playing_audio'));
    resetPlayerState();
  });
}
