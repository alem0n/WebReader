/**
 * 暴露给外部（popup / background 注入脚本 / 旧调用方）的全局桥接函数。
 *
 * 这些 window 入口保留旧名字（edgeTTS* 前缀）以免外部脚本失效，
 * 内部转发到当前模块实现。
 */
import { state } from '../state';
import { logger } from '../log';
import { filterVoices, formatVoiceName } from '../voices';
import { updatePlayButtonState } from '../ui';
import { handleStop } from '../player';

export function installGlobalBridge(): void {
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
}
