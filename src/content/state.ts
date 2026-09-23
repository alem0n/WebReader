/**
 * content 侧全局状态：模块级状态 + initWidget 内部状态 + Shadow DOM 内的 DOM 引用。
 *
 * 原项目中这些是 initWidget 闭包的局部变量与 rootGetById 取到的 const，
 * 迁移为多文件后统一收敛到此处，由 index.ts 的 initWidget 在运行时填充 DOM 引用。
 */
import type { PresetVoice, I18nMessagesResponse } from '../shared/types';
import type { SentencePlayer } from '../shared/sentence-player';
import type { AudioCacheManager } from '../shared/audio-cache';
import type { WebAudioPlayer } from './web-audio-player';
import type { TextUnit } from './extractor';
import type { SentenceMap } from './sentence-map';
import type { ToggleKey } from '../shared/toggle-settings';

/** 当前播放分段信息（用于上一句/下一句导航） */
interface ChunkInfo {
  index?: number;
  total?: number;
  chunkStartIndex?: number;
  chunkSize?: number;
  sentencePositions?: Array<{ index: number; startRatio: number; endRatio: number }>;
}

interface ContentState {
  // ---------- 模块级状态（选中朗读按钮等） ----------
  selectionButton: HTMLButtonElement | null;
  selectionRange: Range | null;
  widgetUserAuthenticated: boolean;
  interfaceLanguage: string;
  i18nMessages: Record<string, string> | null;

  // ---------- initWidget 内部可变状态 ----------
  authCheckInterval: ReturnType<typeof setInterval> | null;
  currentUserEmail: string | null;
  lastAuthenticatedUserKey: string | null;
  allVoices: PresetVoice[];
  filteredVoices: PresetVoice[];
  selectedVoice: PresetVoice | null;
  audioPlayer: WebAudioPlayer | null;
  isLoading: boolean;
  isCollectPageLoading: boolean;
  isCancelled: boolean;
  currentChunkInfo: ChunkInfo | null;
  autoDetectLanguage: boolean;
  removeParentheticals: boolean;
  playbackSpeed: number;
  sentencePlayer: SentencePlayer | null;
  audioCacheManager: AudioCacheManager | null;
  totalElapsedTime: number;
  currentChunkStartTime: number;
  currentVoice: PresetVoice | null;
  navigationRequestId: number;
  currentPlayRequestId: number;
  // shared UI/voices helpers (previously initWidget-local)
  highlightedIndex: number;
  isUserTyping: boolean;
  isLightTheme: boolean;
  isMinimized: boolean;
  voicePanelToggle: HTMLElement | null;
  voiceSearchClear: HTMLElement | null;
  voiceSelectorEl: HTMLElement | null;
  currentTooltip: { element: HTMLElement; tooltip: HTMLElement } | null;
  tooltipHandlers: Array<{ element: HTMLElement; enter: (e?: any) => void; leave: (e?: any) => void }>;
  isDragging: boolean;
  xOffset: number;
  yOffset: number;
  initialX: number;
  initialY: number;
  currentX: number;
  currentY: number;

  // ---------- 待朗读文本暂存（无 API Key 时缓存整页正文，配好后自动消费） ----------
  pendingPageText: string | null;

  // ---------- 网页内逐句高亮（整页朗读时在网页原位高亮当前句子，不覆盖原文） ----------
  /** 主开关 */
  inlineDisplayEnabled: boolean;
  /** 朗读时自动滚动页面（关闭后只高亮不滚动，不动浏览器滚动条） */
  autoScrollEnabled: boolean;
  /** 整页朗读采集的段落单元（句子→DOM 映射的源） */
  pageTextUnits: TextUnit[] | null;
  /** 整页朗读的规范句子表与句子→单元/区间映射（播放器直接灌入，不二次切分） */
  pageTextMap: SentenceMap | null;

  // ---------- Shadow DOM 内的 DOM 引用（initWidget 运行时填充） ----------
  header: HTMLElement | null;
  closeBtn: HTMLButtonElement | null;
  minimizeBtn: HTMLButtonElement | null;
  themeToggleBtn: HTMLButtonElement | null;
  voiceSearchInput: HTMLInputElement | null;
  voiceDropdown: HTMLSelectElement | null;
  voiceLoadingIndicator: HTMLElement | null;
  /** 开关型配置的 checkbox（按 ToggleKey 索引，渲染时填充；禁用 / 同步状态统一遍历此表） */
  toggleCheckboxes: Partial<Record<ToggleKey, HTMLInputElement>>;
  speedSelect: HTMLSelectElement | null;
  languageSelect: HTMLSelectElement | null;
  languageButton: HTMLButtonElement | null;
  languageStrip: HTMLElement | null;
  textContent: HTMLTextAreaElement | null;
  playPauseBtn: HTMLButtonElement | null;
  stopBtn: HTMLButtonElement | null;
  clearBtn: HTMLButtonElement | null;
  prevBtn: HTMLButtonElement | null;
  nextBtn: HTMLButtonElement | null;
  statusText: HTMLElement | null;
  errorMessage: HTMLElement | null;
  errorCloseBtn: HTMLButtonElement | null;
  audioElement: HTMLAudioElement | null;
  playerContainer: HTMLElement | null;
  apiKeyContainer: HTMLElement | null;
  /** 登录功能已移除，恒为 null */
  authContainer: HTMLElement | null;
  /** 登录功能已移除，恒为 null */
  loginBtn: HTMLButtonElement | null;
  userMenuButton: HTMLButtonElement | null;
  userMenu: HTMLElement | null;
  userLogoutBtn: HTMLButtonElement | null;
  userMenuCancel: HTMLButtonElement | null;
  userMenuEmailEl: HTMLElement | null;
}

export const state: ContentState = {
  // 模块级
  selectionButton: null,
  selectionRange: null,
  widgetUserAuthenticated: false,
  interfaceLanguage: 'en',
  i18nMessages: null,
  // initWidget 内部
  authCheckInterval: null,
  currentUserEmail: null,
  lastAuthenticatedUserKey: null,
  allVoices: [],
  filteredVoices: [],
  selectedVoice: null,
  audioPlayer: null,
  isLoading: false,
  isCollectPageLoading: false,
  isCancelled: false,
  currentChunkInfo: null,
  autoDetectLanguage: true,
  removeParentheticals: true,
  playbackSpeed: 1.0,
  sentencePlayer: null,
  audioCacheManager: null,
  totalElapsedTime: 0,
  currentChunkStartTime: 0,
  currentVoice: null,
  navigationRequestId: 0,
  currentPlayRequestId: 0,
  highlightedIndex: -1,
  isUserTyping: false,
  isLightTheme: false,
  isMinimized: false,
  voicePanelToggle: null,
  voiceSearchClear: null,
  voiceSelectorEl: null,
  currentTooltip: null,
  tooltipHandlers: [],
  isDragging: false,
  xOffset: 0,
  yOffset: 0,
  initialX: 0,
  initialY: 0,
  currentX: 0,
  currentY: 0,
  // DOM 引用（运行时填充）
  header: null,
  closeBtn: null,
  minimizeBtn: null,
  themeToggleBtn: null,
  voiceSearchInput: null,
  voiceDropdown: null,
  voiceLoadingIndicator: null,
  toggleCheckboxes: {},
  speedSelect: null,
  languageSelect: null,
  languageButton: null,
  languageStrip: null,
  textContent: null,
  playPauseBtn: null,
  stopBtn: null,
  clearBtn: null,
  prevBtn: null,
  nextBtn: null,
  statusText: null,
  errorMessage: null,
  errorCloseBtn: null,
  audioElement: null,
  playerContainer: null,
  apiKeyContainer: null,
  authContainer: null,
  pendingPageText: null,
  loginBtn: null,
  userMenuButton: null,
  userMenu: null,
  userLogoutBtn: null,
  userMenuCancel: null,
  userMenuEmailEl: null,

  // 网页内逐句高亮
  inlineDisplayEnabled: true, // 主开关默认开（这正是本次需求要的效果）
  autoScrollEnabled: true, // 默认随高亮句滚动页面；关闭后只高亮、不动浏览器滚动条
  pageTextUnits: null,
  pageTextMap: null,
};

// i18n 消息响应类型（供 loadI18nMessages 使用）
export type { I18nMessagesResponse };
