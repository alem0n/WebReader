/** Voices: load / filter / render voice list, select a voice. */
import { state, voiceSearchInput, voiceDropdown, voiceLoadingIndicator, speedSelect } from './state';
import type { PresetVoice } from '../shared/types';
import { pickDefaultVoice } from '../shared/voice-default';
import { resolveRestoredVoice } from '../shared/voice-restore';
import { loadSettings, saveSettings, syncSpeedSelectFromStored } from './settings';
import { hideError, showError } from './ui';
import { i18n } from './i18n';
import { sendToBackground } from '../shared/messaging';
import { logger } from './log';

// 旧服务器配置残留（已移除，仅错误日志保留占位）
const API_URL: string = '';
const API_KEY: string = '';

export async function loadVoices(options: { attempt?: number; authStage?: string } = {}): Promise<void> {
  const attempt = options.attempt || 1;
  const authStage = options.authStage || 'unknown';
  try {
    // Disable dropdown and show voice loading indicator
    voiceSearchInput.disabled = true;
    voiceLoadingIndicator.classList.remove('hidden');

    hideError();

    logger.debug(`Loading MiMo preset voices (attempt=${attempt}, authStage=${authStage})`);

    let bgResponse;
    try {
      bgResponse = await sendToBackground({ action: 'getPresetVoices' });
    } catch (err: any) {
      logger.error('Fetch error:', err);
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        throw new Error(`Cannot load preset voices. Make sure the extension background is running.`);
      }
      throw err;
    }

    if (!bgResponse || !bgResponse.success) {
      const status = bgResponse && bgResponse.status;
      logger.warn(`Failed to load preset voices status=${status || 'n/a'} attempt=${attempt} authStage=${authStage}`);
      throw new Error(bgResponse && bgResponse.error ? bgResponse.error : 'Failed to load voices');
    }

    const voices = bgResponse.voices || [];
    state.allVoices = voices;
    state.filteredVoices = [...state.allVoices];

    // Sort voices by name
    state.filteredVoices.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });

    // Enable dropdown and hide loading
    voiceSearchInput.disabled = false;
    voiceLoadingIndicator.classList.add('hidden');

    logger.debug(`Loaded ${state.allVoices.length} voices (attempt=${attempt}, authStage=${authStage})`);

    // Initialize dropdown with all voices (no search term)
    filterVoices('');

    // 恢复用户手选音色，或按界面语言派生默认音色（落实为单一来源 selectedVoice）。
    // 判据见 shared/voice-restore：旧版自动检测落盘的 selectedVoice 没有手选标志，
    // 一律按界面语言重新派生，避免中文界面恢复英文音色（自愈迁移）。
    const settings = await loadSettings();
    const savedVoice = resolveRestoredVoice(settings, state.allVoices);
    if (savedVoice) {
      selectVoice(savedVoice);
      // 与下拉选中时一致，搜索框显示格式化后的音色名（恢复手选与手选两条路径显示统一）
      voiceSearchInput.value = formatVoiceDisplayName(savedVoice);
      logger.debug('Restored saved voice:', savedVoice.name);
    } else {
      ensureVoiceSelected();
      logger.debug('No saved voice in list, using interface-language default');
    }

    if (speedSelect) {
      state.playbackSpeed = syncSpeedSelectFromStored(speedSelect, settings.playbackSpeed);
    }
  } catch (error: any) {
    voiceSearchInput.disabled = false;
    voiceLoadingIndicator.classList.add('hidden');

    const errorMsg = error.message || 'Unknown error occurred';
    showError(`${i18n('error_loading_voices')} ${errorMsg}`);
    logger.error(`Error loading voices (attempt=${attempt}, authStage=${authStage}):`, error);
    logger.debug('API URL:', API_URL);
    logger.debug('API Key:', API_KEY ? '***' + API_KEY.slice(-4) : 'NOT SET');
    throw error;
  }
}

// Filter voices based on search term
export function filterVoices(searchTerm: string): void {
  const term = searchTerm.toLowerCase().trim();

  if (!term) {
    // If no search term, show all voices
    state.filteredVoices = [...state.allVoices];
  } else {
    // Filter voices by search term
    state.filteredVoices = state.allVoices.filter((voice) => {
      const nameMatch = voice.name?.toLowerCase().includes(term);
      const languageMatch = voice.language?.toLowerCase().includes(term);
      const genderMatch = voice.gender?.toLowerCase().includes(term);
      return nameMatch || languageMatch || genderMatch;
    });
  }

  // Sort filtered voices
  state.filteredVoices.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  renderVoiceDropdown();
}

// Render voice dropdown
export function renderVoiceDropdown() {
  voiceDropdown.innerHTML = '';

  if (state.filteredVoices.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'voice-option';
    emptyItem.style.padding = '15px';
    emptyItem.style.textAlign = 'center';
    emptyItem.style.color = '#999';
    emptyItem.textContent = i18n('no_voices_found');
    voiceDropdown.appendChild(emptyItem);
    return;
  }

  // Show up to 100 voices in dropdown (increased from 50)
  state.filteredVoices.slice(0, 100).forEach((voice) => {
    const option = document.createElement('div');
    option.className = 'voice-option';
    if (state.selectedVoice && state.selectedVoice.name === voice.name) {
      option.classList.add('selected');
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'voice-option-name';
    nameDiv.textContent = formatVoiceDisplayName(voice) || i18n('unknown');

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'voice-option-details';
    const details = [];
    // Language and gender are already shown in the main name
    // Keep the technical voice name for reference
    if (voice.name) details.push(voice.name);
    detailsDiv.textContent = details.join(' • ');

    option.appendChild(nameDiv);
    option.appendChild(detailsDiv);

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      selectVoice(voice);
      voiceSearchInput.value = formatVoiceDisplayName(voice);
      voiceDropdown.classList.add('hidden');
    });

    voiceDropdown.appendChild(option);
  });
}

// Format voice name for display
export function formatVoiceDisplayName(voice: PresetVoice) {
  if (!voice) return '';

  // Extract short name from full name (e.g., "en-AU-WilliamMultilingualNeural" -> "William")
  const nameParts = voice.name.split('-');
  let shortName = nameParts.length > 2 ? nameParts[2] : voice.name;

  // Remove "Multilingual", "Neural" suffixes
  shortName = shortName.replace(/Multilingual|Neural/g, '').trim();

  // Get language name (e.g., "en-AU" -> "English (Australia)")
  const langName = voice.language || '';

  // Format: "Language - Name (Gender)"
  let display = langName;
  if (shortName) {
    display += display ? ` - ${shortName}` : shortName;
  }
  if (voice.gender) {
    display += ` (${voice.gender})`;
  }

  return display || voice.name; // Fallback to technical name
}

// 确保当前已有可用音色：用户手选优先，否则按界面语言派生默认音色。
// 与 content/voices/voice-selection 的 ensureVoiceSelected 同构（单一来源守卫）。
export function ensureVoiceSelected(): PresetVoice | null {
  if (state.voiceSelectionIsManual && state.selectedVoice) {
    return state.selectedVoice;
  }

  const def = pickDefaultVoice(state.allVoices, state.interfaceLanguage);
  if (!def) return state.selectedVoice;

  logger.debug(`Default voice for interface language '${state.interfaceLanguage}': ${def.name}`);
  state.selectedVoice = def;
  state.voiceSelectionIsManual = false;
  voiceSearchInput.value = formatVoiceDisplayName(def);
  return def;
}

// Select a voice
export function selectVoice(voice: PresetVoice) {
  logger.debug('selectVoice called:', {
    voice: voice?.name,
    wasManual: state.voiceSelectionIsManual,
  });

  state.selectedVoice = voice;
  // 手选音色落盘（name 持久化）；派生的默认音色不在此落盘，由 ensureVoiceSelected 保证标记
  state.voiceSelectionIsManual = true;

  saveSettings();
}
