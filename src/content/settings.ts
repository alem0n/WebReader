/** content 侧设置：收集/应用状态到本层 state 与 Shadow DOM */
import { getWidget } from './widget';
import { state } from './state';
import { i18n } from './i18n';
import { persistSettings, readSettings, readTtsProvider, syncSpeedSelectFromStored } from '../shared/settings';
import { TOGGLE_SETTINGS, type ToggleKey } from '../shared/toggle-settings';
import type { ExtensionSettings } from '../shared/types';

export { syncSpeedSelectFromStored, readTtsProvider };

export async function saveSettings(): Promise<void> {
  const widget = getWidget();
  const voiceSelForSave = widget ? widget.querySelector('.voice-selector') : null;
  const settings: Partial<ExtensionSettings> & Record<string, unknown> = {
    selectedVoice: state.selectedVoice ? state.selectedVoice.name : null,
    playbackSpeed: state.playbackSpeed,
    voicePanelControlsCollapsed: !!(voiceSelForSave && voiceSelForSave.classList.contains('voice-selector--collapsed')),
  };
  // 开关型配置按声明表统一写入（新增开关自动持久化，不必改本函数）
  for (const def of TOGGLE_SETTINGS) {
    settings[def.key] = state[def.key];
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
  // 依赖联动（disabled）由 renderToggleSettings 渲染时按 state 计算，避免循环依赖
  const toggles = settings as Record<string, boolean | undefined>;
  const toggleState = state as Record<ToggleKey, boolean>;
  for (const def of TOGGLE_SETTINGS) {
    toggleState[def.key] = toggles[def.key] ?? def.default;
    const cb = state.toggleCheckboxes[def.key];
    if (cb) cb.checked = toggleState[def.key];
  }

  if (state.speedSelect) {
    state.playbackSpeed = syncSpeedSelectFromStored(state.speedSelect, settings.playbackSpeed);
  }

  const widget = getWidget();
  const vsEl = widget ? widget.querySelector('.voice-selector') : null;
  const vpt = widget ? widget.querySelector('#voice-panel-toggle') : null;
  if (vsEl && vpt) {
    if (settings.voicePanelControlsCollapsed === true) {
      vsEl.classList.add('voice-selector--collapsed');
      const u = vpt.querySelector('use');
      if (u) u.setAttribute('href', '#icon-voice-panel-down');
      vpt.setAttribute('title', i18n('expand'));
      vpt.setAttribute('aria-expanded', 'false');
    } else {
      vsEl.classList.remove('voice-selector--collapsed');
      const u = vpt.querySelector('use');
      if (u) u.setAttribute('href', '#icon-voice-panel-up');
      vpt.setAttribute('title', i18n('minimize'));
      vpt.setAttribute('aria-expanded', 'true');
    }
  }

  // selectedVoice will be restored after voices are loaded
  return settings;
}

/**
 * 重读开关型配置到 state（开始新朗读前由播放器调用）。
 *
 * popup 主界面修改的开关对「正在朗读」的内容不生效；下次开始朗读时由此函数读入
 * 最新存储值并同步悬浮窗 checkbox 显示，保证两层配置一致。
 */
export async function reloadToggleSettings(): Promise<void> {
  const stored = await readSettings();
  const toggles = stored as Record<string, boolean | undefined>;
  const toggleState = state as Record<ToggleKey, boolean>;
  for (const def of TOGGLE_SETTINGS) {
    const value = toggles[def.key];
    if (value === undefined || value === null) continue;
    toggleState[def.key] = value;
    const cb = state.toggleCheckboxes[def.key];
    if (cb) cb.checked = value;
  }
}
