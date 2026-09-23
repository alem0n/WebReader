/**
 * content script entry.
 *
 * The original content.js initWidget was a ~4000-line mega-closure; its inner
 * functions/classes are split into voices/player/ui/settings modules. This file keeps:
 *   1) the initialization sequence and event bindings (DOM refs, API-key status check,
 *      settings/voices loading, widget buttons)
 *   2) two nested handlers: handleCollectPage / handlePaste
 *   3) module-level background message listener and text-selection event registration
 */
import { SentencePlayer } from '../shared/sentence-player';
import { state } from './state';
import { logger } from './log';
import {
  i18n,
  loadInterfaceLanguage,
  updateLanguageSelectTooltip,
  changeInterfaceLanguage,
  applyInterfaceLanguage,
  updateLanguageButtonIcon,
} from './i18n';
import { handleTextSelection, toggleWidget, injectSelectionButtonStyles } from './selection';
import { playSelectedText } from './text-input';
import { initPageFab } from './page-fab';
import * as localTts from '../shared/local-tts';
// 句子映射工具已随 handleCollectPage 一并移除（阅读整页改由 playEntirePage 统一入口）
import { resolveClickJumpTarget } from './reading-overlay';
import { getWidget, setWidgetInitializer } from './widget';
import { saveSettings, loadStoredSettings } from './settings';
import { populateSpeedOptions } from '../shared/settings';
import { renderToggleSettings } from './toggle-settings';
import { WebAudioPlayer } from './web-audio-player';
import { formatVoiceName, loadVoices, filterVoices, selectVoice, updateHighlightedOption, clearVoicesCache } from './voices';
import { handlePlayPause, handleStop, handleClear, handlePrev, handleNext, playEntirePage, jumpToSentence } from './player';
import {
  showPlayerScreenInWidget,
  showApiKeyScreenInWidget,
  checkApiKeyStatusForWidget,
  setupApiKeyUIInWidget,
  dragStart,
  drag,
  dragEnd,
  updateButtonStates,
  setupDisabledTooltips,
  updatePlayButtonState,
  updateClearButton,
  setVoicePanelCollapsed,
  resetPlayerState,
  showError,
  hideError,
  updateStatusText,
} from './ui';

declare global {
  interface Window {
    edgeTTSShowWidgetLogin?: () => void;
    edgeTTSRefreshVoiceLabels?: () => void;
    edgeTTSUpdatePlayButton?: () => void;
    edgeTTSGetSelectedVoice?: () => any;
    edgeTTSStopPlayback?: () => void;
    edgeTTSEnableAutoDetectIfNoVoice?: () => void;
    playSelectedText?: (text: string) => void;
    playEntirePage?: () => Promise<void>;
    ttsWidgetShadowRoot?: ShadowRoot | null;
  }
}

// Inject selection button styles on load (kept for compatibility; real styles live in Shadow DOM)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectSelectionButtonStyles);
} else {
  injectSelectionButtonStyles();
}

// 页面内「朗读整页」悬浮按钮：有正文时自动出现在右下角，点击直接识别并朗读
initPageFab();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request: any, _sender: chrome.runtime.MessageSender, _sendResponse: (response?: any) => void) => {
  if (request.action === 'toggle') {
    toggleWidget();
  } else if (request.action === 'playSelectedText') {
    playSelectedText(request.text as string);
  } else if (request.action === 'readEntirePage') {
    playEntirePage();
  } else if (request.action === 'apiKeySaved') {
    // popup 配好 Key 后，页面悬浮窗从 Key 界面切回播放器；
    // 若之前点 FAB 时暂存了整页正文，自动填入并开始朗读（动线 A1/A2 修复）
    onApiKeySaved();
  } else if (request.action === 'relayConfigSaved') {
    // 后端配置变更（provider 切换 / 地址变更）：音色目录与 provider 已变，
    // 清掉旧音色缓存并重载，避免悬浮窗继续用旧 provider 的音色
    onRelayConfigSaved();
  }
});

export async function initWidget(widgetElement: HTMLElement | null): Promise<void> {
  // Load interface language first
  await loadInterfaceLanguage();

  const widget = widgetElement || getWidget();
  if (!widget) return;
  const root: any = widget.getRootNode() instanceof ShadowRoot ? widget.getRootNode() : document;
  const rootGetById = (id: string): any => (root.getElementById ? root.getElementById(id) : document.getElementById(id));

  state.header = rootGetById('tts-widget-header');
  state.closeBtn = rootGetById('tts-widget-close');
  state.minimizeBtn = rootGetById('tts-widget-minimize');
  state.themeToggleBtn = rootGetById('tts-widget-theme-toggle');
  state.voiceSearchInput = rootGetById('voice-search');
  state.voiceDropdown = rootGetById('voice-dropdown');
  state.voiceLoadingIndicator = rootGetById('voice-loading');
  state.speedSelect = rootGetById('speed-select');
  state.languageSelect = rootGetById('language-select');
  state.languageButton = rootGetById('language-button');
  state.languageStrip = rootGetById('language-strip');

  // 括号匹配：删除括号及其中的内容（支持中英文圆/方/花括号，栈式嵌套匹配；不处理书名号《》与引号）

  // 朗读前文本统一预处理：若开启“删除括号内容”则过滤，否则原样返回

  // Apply interface language to widget
  applyInterfaceLanguage(state.interfaceLanguage);

  // Helper: map locale -> flag symbol id

  // Update language square button icon

  // Set language selector value and update tooltip + button icon
  if (state.languageSelect) {
    state.languageSelect.value = state.interfaceLanguage;
    updateLanguageSelectTooltip(state.interfaceLanguage);
    updateLanguageButtonIcon(state.interfaceLanguage);
  }
  state.textContent = rootGetById('text-content');
  state.playPauseBtn = rootGetById('play-pause-btn');
  state.stopBtn = rootGetById('stop-btn');
  state.clearBtn = rootGetById('clear-btn');
  state.prevBtn = rootGetById('prev-btn');
  state.nextBtn = rootGetById('next-btn');
  state.statusText = rootGetById('status-text');
  state.errorMessage = rootGetById('error-message');
  state.errorCloseBtn = rootGetById('error-close-btn');
  state.audioElement = rootGetById('audio-player');

  state.playerContainer = rootGetById('player-container');
  state.apiKeyContainer = rootGetById('apikey-container');
  state.userMenuButton = rootGetById('user-menu-button');
  state.userMenu = rootGetById('user-menu');
  state.userLogoutBtn = rootGetById('user-logout-btn');
  state.userMenuCancel = rootGetById('user-menu-cancel');
  state.userMenuEmailEl = rootGetById('user-menu-email');
  state.authCheckInterval = null;
  state.currentUserEmail = null;
  state.lastAuthenticatedUserKey = null;

  // Send usage stat event to backend (fire-and-forget)

  // 旧认证辅助函数已移除（登录功能已删除）

  // ---------- API Key 状态（widget 内仅作提示，配置统一在插件主界面完成） ----------

  if (state.loginBtn) {
    // 登录已移除：登录按钮不再执行任何操作
    state.loginBtn.addEventListener('click', () => {
      /* no-op */
    });
  }

  if (state.userMenuButton) {
    state.userMenuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.userMenu) return;
      // Обновляем email перед показом
      if (state.userMenuEmailEl) {
        state.userMenuEmailEl.textContent = state.currentUserEmail || '';
      }
      state.userMenu.classList.remove('hidden');
    });
  }

  if (state.userMenuCancel) {
    state.userMenuCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (state.userMenu) state.userMenu.classList.add('hidden');
    });
  }

  if (state.userMenu) {
    state.userMenu.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  if (state.userLogoutBtn) {
    // 登录已移除：登出按钮不再执行任何操作
    state.userLogoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  }

  // Первая инициализация состояния — 检查 API Key，未配置则显示填写界面（模仿原登录流程）
  setupApiKeyUIInWidget();
  const keyStatus = await checkApiKeyStatusForWidget();
  const hasKey = !!(keyStatus && (keyStatus as any).hasKey);
  if (!hasKey && !localTts.canSpeak()) {
    // 既无 Key 又无本地音色：只能引导到主界面配置 Key
    logger.warn('No API Key configured and local TTS unavailable, showing API key screen');
    showApiKeyScreenInWidget();
  } else {
    // 有 Key，或本地音色可用（未配置 Key 也能朗读，开箱即用）→ 直接进入播放器
    showPlayerScreenInWidget();
    if (!hasKey) {
      updateStatusText('未配置 MiMo API Key，当前使用本地音色；可在主界面填写 Key 启用 MiMo 音色');
    }
  }

  window.edgeTTSShowWidgetLogin = () => {
    const el = getWidget();
    if (el) {
      el.style.display = 'block';
    }
    // 无 API Key 时显示填写界面
    showApiKeyScreenInWidget();
  };

  // 登录已移除：无需在窗口重新聚焦时刷新认证状态
  window.addEventListener('focus', () => {
    // no-op
  });
  document.addEventListener('visibilitychange', () => {
    // no-op
  });

  // State
  state.allVoices = [];
  state.filteredVoices = [];
  state.selectedVoice = null;
  state.audioPlayer = null;
  state.isLoading = false;
  state.isCollectPageLoading = false;
  state.isCancelled = false; // Flag to cancel ongoing requests when Clear/Stop is pressed
  state.currentChunkInfo = null; // Store current chunk info for navigation
  state.autoDetectLanguage = true;
  state.removeParentheticals = true; // 朗读前删除括号及其中的内容（可开关，默认开）
  state.playbackSpeed = 1.0;
  state.sentencePlayer = null;
  state.audioCacheManager = null; // AudioCacheManager: producer-consumer cache for TTS audio
  state.totalElapsedTime = 0; // Total elapsed time for all chunks
  state.currentChunkStartTime = 0; // Start time of current chunk playback
  state.currentVoice = null; // Current voice being used (for cache checking)
  state.navigationRequestId = 0; // Counter to track navigation requests and cancel outdated ones
  state.currentPlayRequestId = 0; // Counter to track play requests and cancel outdated ones
  // Language code to full name mapping (English base)

  // Locale (e.g. en-US) to flag symbol ID

  // Language Detection

  // Check if a language code is Asian (Japanese, Chinese, Korean, Arabic)

  // Get adjusted chunk size based on language

  // Get maximum characters per chunk for Asian languages

  // Sentence Player Class

  // AudioCacheManager: 生产者-消费者模式的音频缓存队列
  // 后台持续维持 maxPrefetch 个句子的音频缓存，播放时直接从队列取出

  // Settings Persistence

  // Initialize sentence player early
  state.sentencePlayer = new SentencePlayer();
  logger.debug('SentencePlayer created');

  // Format voice name for display
  // Scroll to current chunk in text area

  // Collect text from page (h1-h6 and p elements, top to bottom, visible only)

  state.isDragging = false;
  state.currentX = 0;
  state.currentY = 0;
  state.initialX = 0;
  state.initialY = 0;
  state.xOffset = 0;
  state.yOffset = 0;

  widget.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // Close button
  state.closeBtn!.addEventListener('click', () => {
    widget.style.display = 'none';
  });

  // Theme toggle button —— 默认 Duolingo 亮色主题；存储为 'dark' 时启用暗色变体
  state.isLightTheme = localStorage.getItem('tts-theme') !== 'dark';
  if (!state.isLightTheme) {
    widget.classList.add('dark-theme');
    const themeIcon = state.themeToggleBtn!.querySelector('use') as any;
    themeIcon.setAttribute('href', '#icon-sun');
  }

  state.themeToggleBtn!.addEventListener('click', () => {
    state.isLightTheme = !state.isLightTheme;
    widget.classList.toggle('dark-theme', !state.isLightTheme);

    const themeIcon = state.themeToggleBtn!.querySelector('use') as any;
    if (state.isLightTheme) {
      themeIcon.setAttribute('href', '#icon-moon');
      localStorage.setItem('tts-theme', 'light');
    } else {
      themeIcon.setAttribute('href', '#icon-sun');
      localStorage.setItem('tts-theme', 'dark');
    }
  });

  // Minimize button
  state.isMinimized = false;

  state.minimizeBtn!.addEventListener('click', () => {
    state.isMinimized = !state.isMinimized;

    const minimizeIcon = state.minimizeBtn!.querySelector('use') as any;
    const headerButtons = widget.querySelector('.header-buttons');
    const playerControls = widget.querySelector('.player-controls');
    const currentTransform = widget.style.transform || '';
    const translateMatch = currentTransform.match(/translate\([^)]+\)/);
    const currentTranslate = translateMatch ? translateMatch[0] : '';

    // 收起态全部由 .minimized 类驱动（隐藏哪些元素、宽度与内边距见 widget 样式表）
    widget.classList.toggle('minimized', state.isMinimized);

    if (state.isMinimized) {
      // 恢复按钮挪进播放控制行并隐藏整个头部，把上中下三层并为两层
      if (playerControls && state.minimizeBtn!.parentElement !== playerControls) {
        playerControls.appendChild(state.minimizeBtn!);
      }
      widget.style.transform = `${currentTranslate} scale(0.8625)`.trim();
      widget.style.transformOrigin = 'top right';
      if (minimizeIcon) minimizeIcon.setAttribute('href', '#icon-expand');
      state.minimizeBtn!.title = i18n('expand');
    } else {
      // 恢复按钮回到头部原位（.header-buttons 的第一个子节点）
      if (headerButtons && state.minimizeBtn!.parentElement !== headerButtons) {
        headerButtons.insertBefore(state.minimizeBtn!, headerButtons.firstChild);
      }
      widget.style.transform = currentTranslate || '';
      widget.style.transformOrigin = '';
      if (minimizeIcon) minimizeIcon.setAttribute('href', '#icon-minimize');
      state.minimizeBtn!.title = i18n('minimize');
    }
  });

  // Load voices from API via background script

  // Load voices from server (used for initial load and cache refresh)

  // Filter voices

  // Render dropdown

  // Select voice
  // Format voice name for display

  // Format seconds to MM:SS

  // Estimate total duration based on text

  // Update time progress display

  // Highlight first sentence when text appears (before playback starts)

  // Update text highlight with current sentence

  // Update button states

  // Setup tooltips for disabled elements
  state.tooltipHandlers = [];

  state.currentTooltip = null;

  // Make functions globally accessible for external text additions
  window.edgeTTSUpdatePlayButton = updatePlayButtonState;
  window.edgeTTSGetSelectedVoice = () => state.selectedVoice;
  window.edgeTTSRefreshVoiceLabels = () => {
    if (state.selectedVoice) {
      state.voiceSearchInput!.value = formatVoiceName(state.selectedVoice);
    }
    filterVoices('', false, !!state.selectedVoice);
  };
  window.edgeTTSStopPlayback = () => {
    handleStop();
  };
  window.edgeTTSEnableAutoDetectIfNoVoice = () => {
    // Only enable auto-detect if no voice is selected
    if (!state.selectedVoice) {
      state.autoDetectLanguage = true;
      const cb = state.toggleCheckboxes.autoDetectLanguage;
      if (cb) cb.checked = true;
      logger.debug('Auto-detect enabled (no voice selected)');
    } else {
      logger.debug('Voice already selected, keeping it:', state.selectedVoice.name);
    }
    updatePlayButtonState();
  };

  // WebAudioPlayer: 用 Web Audio API 播放的 HTMLAudioElement 平替。
  // 页面 CSP（default-src 'self'，未设 media-src）会拦截 blob: 媒体 URL，
  // 导致 <audio> 报 "Failed to load because no supported source was found."；
  // Web Audio 在 JS 内解码播放，完全绕过页面 CSP。

  // Setup audio player
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

  // Event listeners
  state.voiceSearchClear = rootGetById('voice-search-clear');

  // Show/hide clear button based on input value and disabled state

  // Track if user is actively typing (not just clicking)
  state.isUserTyping = false;
  state.highlightedIndex = -1; // Track keyboard navigation index

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
    state.selectedVoice = null;
    saveSettings();
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

  // 开关型配置（自动检测 / 删除括号 / 网页内高亮 / 自动滚动）已改为数据驱动渲染，
  // 事件绑定见 toggle-settings.ts 的 renderToggleSettings，不再逐一手写。

  state.voiceSelectorEl = widget.querySelector('.voice-selector') as any;
  state.voicePanelToggle = rootGetById('voice-panel-toggle');
  if (state.voicePanelToggle && state.voiceSelectorEl) {
    state.voicePanelToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextCollapsed = !state.voiceSelectorEl!.classList.contains('voice-selector--collapsed');
      setVoicePanelCollapsed(nextCollapsed);
    });
  }

  // Speed control
  state.speedSelect!.addEventListener('change', (e) => {
    state.playbackSpeed = parseFloat((e.target as any).value);
    logger.debug('Speed changed to:', state.playbackSpeed);
    saveSettings();
  });

  // Language selector
  if (state.languageSelect) {
    // Update tooltip on initialization
    updateLanguageSelectTooltip(state.interfaceLanguage);

    state.languageSelect.addEventListener('change', async (e) => {
      const selectedLocale = (e.target as any).value;
      logger.debug('Language selector changed to:', selectedLocale);
      try {
        await changeInterfaceLanguage(selectedLocale);
        updateLanguageSelectTooltip(selectedLocale);
        logger.debug('Language change completed successfully');
      } catch (error) {
        logger.error('Error changing language:', error);
      }
    });
    logger.debug('Language selector event listener attached');
  } else {
    logger.warn('Language selector not found!');
  }

  // Horizontal language strip (slide from top)
  if (state.languageButton && state.languageStrip && state.languageSelect && !(state.languageButton as any)._languageStripInitialized) {
    (state.languageButton as any)._languageStripInitialized = true;
    const flags = state.languageStrip.querySelectorAll('.language-strip-flag');

    const openStrip = () => {
      state.languageStrip!.classList.add('open');
      state.languageButton!.setAttribute('aria-expanded', 'true');
    };

    const closeStrip = () => {
      state.languageStrip!.classList.remove('open');
      state.languageButton!.setAttribute('aria-expanded', 'false');
    };

    state.languageButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.languageStrip!.classList.contains('open')) {
        closeStrip();
      } else {
        openStrip();
      }
    });

    state.languageButton.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    flags.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const locale = btn.getAttribute('data-locale');
        if (!locale) return;
        state.languageSelect!.value = locale;
        updateLanguageButtonIcon(locale);
        const event = new Event('change', { bubbles: true });
        state.languageSelect!.dispatchEvent(event);
        closeStrip();
      });
    });

    document.addEventListener('click', (e) => {
      if (!state.languageStrip!.contains(e.target as any) && !state.languageButton!.contains(e.target as any)) {
        closeStrip();
      }
    });
  }

  // Player controls

  state.playPauseBtn!.addEventListener('click', handlePlayPause);
  state.stopBtn!.addEventListener('click', handleStop);
  state.clearBtn!.addEventListener('click', handleClear);
  state.prevBtn!.addEventListener('click', handlePrev);
  state.nextBtn!.addEventListener('click', handleNext);

  // Functions

  // Play sentence chunk (1 sentence at a time)

  // prefetchNextChunk 已被 AudioCacheManager 的生产者循环取代

  // Try to get readable text for the whole page from the backend.
  // Falls back to local DOM-based extraction if the backend is unavailable or returns an error.
  // 服务器提取已移除：整页文本直接本地 DOM 提取（不向任何服务器发送 HTML）
  // Handle Paste from clipboard
  // Handle Previous Sentence (with debouncing)

  // Handle Next Sentence (with debouncing)

  /** Short slug for v3 URL logs only, e.g. en-AU-WilliamMultilingualNeural → en-au-william */

  // Update status text

  // Show/hide loading indicator (uses status-text, no separate element)

  // Error close button
  if (state.errorCloseBtn) {
    state.errorCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideError();
    });
  }

  // Load stored settings and voices on init
  (async () => {
    // Set default speed（0.1 步长档位动态生成，见 shared/settings）
    if (state.speedSelect) {
      populateSpeedOptions(state.speedSelect);
      state.speedSelect.value = '1.0';
    }

    await loadStoredSettings();
    // 开关型配置由声明表数据驱动渲染（在读取存储之后，勾选与可用状态才与存储一致）
    renderToggleSettings(rootGetById('toggle-settings-column'));
    await loadVoices();
  })();

  // Export function to be called from outside
  window.playSelectedText = playSelectedText;
}

// ---------------------------------------------------------------------------
// 网页内点击跳转朗读：document 级委托监听（注册一次，不随 prepare/clear 增删）
//
// 只处理「已 prepare 的句子 span」上的点击：主开关开启且存在句子映射时才生效；
// 链接/按钮/修饰键/拖选等一律放行浏览器默认行为（详见 resolveClickJumpTarget）。
// 悬浮窗（Shadow DOM）内点击冒泡到 document 时 target 为 shadow host，
// findSentenceIndexFromNode 返回 null，天然不误触发。
// ---------------------------------------------------------------------------

/** mousedown 坐标，供 click 时判定是否为拖选文字 */
let pointerDownPos: { x: number; y: number } | null = null;

document.addEventListener('mousedown', (e: MouseEvent) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

document.addEventListener('click', (e: MouseEvent) => {
  // 无句子映射（选中朗读/粘贴/未朗读过）或主开关关闭：完全不干预页面点击
  if (!state.inlineDisplayEnabled) return;
  const map = state.pageTextMap;
  if (!map) return;

  const targetIndex = resolveClickJumpTarget(e, map, pointerDownPos);
  if (targetIndex === null) return;

  // 命中句子 span：跳转朗读。不 preventDefault —— span 无默认行为，
  // 被排除的链接/按钮早已在上面放行。
  jumpToSentence(targetIndex);
});

// 注册 widget 初始化钩子（在此处而非 widget.ts 内调用，以打破循环依赖）
setWidgetInitializer(initWidget);

// 暴露给外部（popup / background 注入脚本）调用：朗读整页
window.playEntirePage = playEntirePage;

/**
 * 收到「API Key 已保存」广播时：
 * 1. 若悬浮窗正停在 Key 界面，切回播放器；
 * 2. 若之前点 FAB 暂存了整页正文，自动填入并开始朗读。
 *
 * 修复动线 A1/A2：用户首次使用时「点 FAB → 弹窗要求配 Key → popup 配好 →
 * 回到页面」能无缝接上，无需再点一次 FAB。
 */
function onApiKeySaved(): void {
  const wasKeyScreen = state.apiKeyContainer && state.apiKeyContainer.style.display !== 'none';

  if (wasKeyScreen) {
    showPlayerScreenInWidget();
  }

  const pending = state.pendingPageText;
  if (pending) {
    state.pendingPageText = null;
    // 播放器界面已切回，走正常填入+自动播放流程
    playEntirePage();
  }
}

/**
 * 后端配置变更：provider 切换或中转地址变更后，旧 provider 的音色已失效。
 * 清音色缓存并静默重载（不抢当前朗读，下次开始朗读即用新 provider）。
 */
async function onRelayConfigSaved(): Promise<void> {
  try {
    await clearVoicesCache('relay-config-saved');
    await loadVoices({ forceRefresh: true, authStage: 'relay-config-saved' });
  } catch (e) {
    logger.warn('onRelayConfigSaved reload voices failed:', e);
  }
}

// Text selection: green FAB always plays immediately (login removed, see showSelectionButton).
document.addEventListener('selectionchange', () => {
  handleTextSelection();
});

// Also listen for mouseup to catch selections
document.addEventListener('mouseup', () => {
  setTimeout(() => {
    handleTextSelection();
  }, 10);
});
