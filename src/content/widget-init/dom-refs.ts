/**
 * 填充 state 的 Shadow DOM 引用。
 *
 * 这些引用在 initWidget 挂载 widget 之后才非空（AGENTS.md §7），
 * 其它初始化步骤（主题 / 收起 / 事件绑定）都依赖本步骤先完成。
 */
import { state } from '../state';

/** 从 Shadow DOM（或 document）取元素并把引用写入 state */
export function fillWidgetDomRefs(rootGetById: (id: string) => any): void {
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
}
