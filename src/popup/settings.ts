/** popup 侧设置：收集/应用状态到本层 state 与弹窗 DOM */
import { state, speedSelect, toggleCheckboxes, voiceSelectorEl, voicePanelToggle } from './state';
import { i18n } from './i18n';
import { persistSettings, readSettings, syncSpeedSelectFromStored } from '../shared/settings';
import { TOGGLE_SETTINGS, type ToggleKey } from '../shared/toggle-settings';
import type { ExtensionSettings } from '../shared/types';

export { syncSpeedSelectFromStored };

export async function saveSettings(): Promise<void> {
  const settings: Partial<ExtensionSettings> & Record<string, unknown> = {
    selectedVoice: state.selectedVoice ? state.selectedVoice.name : null,
    playbackSpeed: state.playbackSpeed,
    voicePanelControlsCollapsed: !!(voiceSelectorEl && voiceSelectorEl.classList.contains('voice-selector--collapsed')),
  };
  // 开关型配置按声明表统一写入（新增开关自动持久化，不必改本函数）
  for (const def of TOGGLE_SETTINGS) {
    settings[def.key] = (state as Record<ToggleKey, boolean>)[def.key];
  }
  persistSettings(settings as ExtensionSettings);
}

export async function loadSettings(): Promise<Partial<ExtensionSettings>> {
  return readSettings();
}

// Load stored settings
export async function loadStoredSettings(): Promise<Partial<ExtensionSettings>> {
  const settings = await loadSettings();

  // 开关型配置：按声明表统一读取（存储缺失时按声明默认值兜底）并同步 checkbox；
  // 依赖联动（disabled）由 renderToggleSettings 渲染时按 state 计算
  const toggles = settings as Record<string, boolean | undefined>;
  const toggleState = state as Record<ToggleKey, boolean>;
  for (const def of TOGGLE_SETTINGS) {
    toggleState[def.key] = toggles[def.key] ?? def.default;
    const cb = toggleCheckboxes[def.key];
    if (cb) cb.checked = toggleState[def.key];
  }

  if (speedSelect) {
    state.playbackSpeed = syncSpeedSelectFromStored(speedSelect, settings.playbackSpeed);
  }

  if (voiceSelectorEl && voicePanelToggle) {
    if (settings.voicePanelControlsCollapsed === true) {
      voiceSelectorEl.classList.add('voice-selector--collapsed');
      const u = voicePanelToggle.querySelector('use');
      if (u) u.setAttribute('href', '#icon-voice-panel-down');
      voicePanelToggle.title = i18n('expand');
      voicePanelToggle.setAttribute('aria-expanded', 'false');
    } else {
      voiceSelectorEl.classList.remove('voice-selector--collapsed');
      const u = voicePanelToggle.querySelector('use');
      if (u) u.setAttribute('href', '#icon-voice-panel-up');
      voicePanelToggle.title = i18n('minimize');
      voicePanelToggle.setAttribute('aria-expanded', 'true');
    }
  }

  // selectedVoice will be restored after voices are loaded
  return settings;
}
