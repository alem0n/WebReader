/** popup 全局状态（可变）与 DOM 引用（模块单例，跨模块共享） */
import type { PresetVoice } from '../shared/types';
import type { ToggleKey } from '../shared/toggle-settings';

/** popup 全局可变状态 */
export const state = {
  allVoices: [] as PresetVoice[],
  filteredVoices: [] as PresetVoice[],
  selectedVoice: null as PresetVoice | null,
  /** 音色是否为用户显式选择：true 沿用手选音色，false 按界面语言派生默认音色 */
  voiceSelectionIsManual: false,
  removeParentheticals: true, // 朗读前删除括号及其中的内容（可开关，默认开）
  // 以下两个开关仅在网页悬浮窗侧产生实际效果，popup 侧只作全局配置中转：
  // 修改后写入存储，对「正在朗读」不生效，下次开始朗读时由 content 读入
  inlineDisplayEnabled: true, // 网页内逐句高亮（整页朗读时在网页原位高亮当前句）
  autoScrollEnabled: true, // 朗读时自动滚动页面（从属于网页内高亮）
  playbackSpeed: 1.0,
  isAuthenticated: false,
  playerInitialized: false, // 区分首次配置与修改 Key 场景
  interfaceLanguage: 'en',
  i18nMessages: null as Record<string, string> | null,
};

/* ---------------------------- DOM 引用 ---------------------------- */
// popup.html 的 <script> 在 body 末尾，加载时 DOM 已就绪
export const voiceSearchInput = document.getElementById('voice-search') as HTMLInputElement;
export const voiceDropdown = document.getElementById('voice-dropdown') as HTMLElement;
export const voiceLoadingIndicator = document.getElementById('voice-loading') as HTMLElement;
export const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
export const errorMessage = document.getElementById('error-message') as HTMLElement;
export const voiceSelectorEl = document.querySelector('.voice-selector') as HTMLElement;
export const voicePanelToggle = document.getElementById('voice-panel-toggle') as HTMLElement;
/** 开关型配置的 checkbox（按 ToggleKey 索引，renderToggleSettings 填充） */
export const toggleCheckboxes: Partial<Record<ToggleKey, HTMLInputElement>> = {};
