/** popup entry point: DOMContentLoaded init flow and event listener binding. */
import { state, voiceSearchInput, voiceDropdown, speedSelect, voiceSelectorEl, voicePanelToggle, toggleCheckboxes } from './state';
import { TOGGLE_SETTINGS, type ToggleKey } from '../shared/toggle-settings';
import { logger } from './log';
import { loadInterfaceLanguage, toggleInterfaceLanguage } from './i18n';
import { checkApiKeyStatus, loadVoicesWithRetry } from './api-key-ui';
import { setConfigPanelOpen, syncEngineFromStorage, updateConfigToggleLabel, refreshRelayStatus } from './config-ui';
import { filterVoices, ensureVoiceSelected } from './voices';
import { loadStoredSettings, saveSettings } from './settings';
import { populateSpeedOptions } from '../shared/settings';
import { i18n } from './i18n';

document.addEventListener('DOMContentLoaded', async () => {
  // 统一入口：语音引擎与全局配置同屏，当前引擎未配置时展开「配置 / 切换」面板

  // Load interface language first
  await loadInterfaceLanguage();

  // 读取当前 provider 并同步面板引擎选中态
  const provider = await syncEngineFromStorage();

  // 同时检查 MiMo Key 与后端中转配置状态，驱动首屏与顶部按钮文案
  const [keyStatus, relayStatus] = await Promise.all([checkApiKeyStatus(), refreshRelayStatus()]);
  const hasKey = !!(keyStatus && keyStatus.hasKey);
  const hasRelay = !!(relayStatus && relayStatus.url);
  logger.info('provider=', provider, 'hasKey=', keyStatus.maskedKey || '(none)', 'hasRelay=', hasRelay);

  state.isAuthenticated = hasKey;

  // 当前引擎是否已配置：relay 看后端地址，mimo 看 API Key
  const configured = provider === 'relay' ? hasRelay : hasKey;
  updateConfigToggleLabel(provider, configured);

  if (!configured) {
    // 未配置：展开统一配置面板引导填写，其余控件保持可用
    setConfigPanelOpen(true);
    return;
  }

  // 已配置：收起面板，加载音色与已存设置
  setConfigPanelOpen(false);

  // Set default speed (overridden by storage when present; 0.1 步长档位动态生成，见 shared/settings)
  populateSpeedOptions(speedSelect);
  if (speedSelect) speedSelect.value = '1.0';

  await loadStoredSettings();
  // 开关型配置由声明表数据驱动渲染（在读取存储之后，勾选与可用状态才与存储一致）
  renderToggleSettings(document.getElementById('toggle-settings-column'));

  setupEventListeners();
  try {
    await loadVoicesWithRetry({ authStage: 'post-auth-initial', maxAttempts: 3 });
  } catch (e) {
    logger.warn('loadVoices failed, UI stays usable:', e);
  }
  state.playerInitialized = true;
});

/** 各开关 change 时的额外副作用（通用逻辑已处理 state 写入、持久化与依赖联动） */
const TOGGLE_CHANGE_HANDLERS: Partial<Record<ToggleKey, (checked: boolean) => void>> = {
  // 音色默认值改由界面语言派生（docs/adr/0002），不再需要开关副作用；
  // 保留此表作为后续开关扩展点
};

/** 读取某开关当前是否可用（被依赖开关关闭时禁用） */
function isToggleEnabled(key: ToggleKey): boolean {
  const def = TOGGLE_SETTINGS.find((d) => d.key === key);
  if (!def?.dependsOn) return true;
  return !!(state as Record<ToggleKey, boolean>)[def.dependsOn];
}

/**
 * 渲染全部开关型配置（数据驱动）。
 *
 * 遍历 shared/toggle-settings 声明表：新增开关只需在声明表追加一项，popup 主界面
 * 即自动出现对应开关，与网页悬浮窗永远对齐。须在 loadStoredSettings 之后调用，
 * 勾选与可用状态才与存储一致。幂等：已渲染过则跳过。
 */
export function renderToggleSettings(column: HTMLElement | null): void {
  if (!column || Object.keys(toggleCheckboxes).length) return;

  for (const def of TOGGLE_SETTINGS) {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.style.marginTop = '4px';
    label.title = def.title;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `toggle-${def.key}`;
    input.checked = !!(state as Record<ToggleKey, boolean>)[def.key];
    input.disabled = !isToggleEnabled(def.key);

    const span = document.createElement('span');
    span.textContent = def.label;

    label.appendChild(input);
    label.appendChild(span);
    column.appendChild(label);

    toggleCheckboxes[def.key] = input;

    input.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      (state as Record<ToggleKey, boolean>)[def.key] = checked;
      logger.debug(`${def.key} changed to:`, checked);
      // 依赖联动：主开关变化后刷新从属开关可用性
      for (const d of TOGGLE_SETTINGS) {
        const cb = toggleCheckboxes[d.key];
        if (cb) cb.disabled = !isToggleEnabled(d.key);
      }
      saveSettings();
      TOGGLE_CHANGE_HANDLERS[def.key]?.(checked);
    });
  }
}

export function setupEventListeners() {
  // Voice search
  voiceSearchInput.addEventListener('input', (e) => {
    filterVoices((e.target as HTMLInputElement).value);
    // Keep dropdown open when searching
    if (state.filteredVoices.length > 0) {
      voiceDropdown.classList.remove('hidden');
    } else {
      voiceDropdown.classList.add('hidden');
    }
  });

  /**
   * 聚焦 / 点击音色搜索框时展示默认备选列表。
   *
   * 不能拿 voiceSearchInput.value 当搜索词：输入框里显示的是「已选音色的显示名」
   * （默认派生时为 "zh-CN - MiMo-默认"，恢复手选时为原始名 "MiMo-默认"），而
   * filterVoices 只按 name / language / gender 匹配 —— 按显示名过滤会得到 0 条
   * （下拉看不到任何备选）或 1 条（只能选到当前音色本身）。只有用户真正键入的文本
   * 才是搜索词，由 input 事件处理。
   *
   * 默认视图按已选音色的语言收窄（filterVoices 的 filterByLanguage）：后端中转
   * （Edge）目录有几百个音色，全量铺开时中文会落在 100 条截断之外而不可见。
   * 已选音色为空时仍展示全部语言。
   */
  function showVoicesOnOpen(): void {
    if (state.allVoices.length === 0) return;
    filterVoices('', !!state.selectedVoice);
    voiceDropdown.classList.remove('hidden');
  }

  voiceSearchInput.addEventListener('focus', () => {
    showVoicesOnOpen();
  });

  voiceSearchInput.addEventListener('click', () => {
    showVoicesOnOpen();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.dropdown-container')) {
      voiceDropdown.classList.add('hidden');
    }
  });

  function setVoicePanelCollapsed(collapsed: boolean) {
    if (!voiceSelectorEl || !voicePanelToggle) return;
    voiceSelectorEl.classList.toggle('voice-selector--collapsed', !!collapsed);
    const useEl = voicePanelToggle.querySelector('use');
    if (useEl) useEl.setAttribute('href', collapsed ? '#icon-voice-panel-down' : '#icon-voice-panel-up');
    voicePanelToggle.title = i18n(collapsed ? 'expand' : 'minimize');
    voicePanelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    saveSettings();
  }
  if (voicePanelToggle && voiceSelectorEl) {
    voicePanelToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextCollapsed = !voiceSelectorEl.classList.contains('voice-selector--collapsed');
      setVoicePanelCollapsed(nextCollapsed);
    });
  }

  // 开关型配置（自动检测 / 删除括号 / 网页内高亮 / 自动滚动）由 renderToggleSettings
  // 数据驱动渲染并统一绑定事件，不再逐一手写。

  // Speed control
  speedSelect.addEventListener('change', (e) => {
    state.playbackSpeed = parseFloat((e.target as HTMLSelectElement).value);
    logger.debug('Speed changed to:', state.playbackSpeed);
    saveSettings();
  });
}

/**
 * 界面语言切换按钮（中 / EN）。
 *
 * 独立于引擎配置状态绑定：未配置 MiMo Key / 后端地址时 index.ts 的初始化会提前
 * return，不会走到 setupEventListeners，但语言切换与引擎无关，必须始终可用
 * （与悬浮窗开关 / 快捷操作 / 配置面板的无条件绑定保持一致）。
 */
export function setupLanguageToggle(): void {
  const languageToggleBtn = document.getElementById('language-toggle-btn');
  if (!languageToggleBtn) return;

  languageToggleBtn.addEventListener('click', async () => {
    await toggleInterfaceLanguage();
    // 未手选音色时，默认音色跟随界面语言重新派生（落实单一来源并同步搜索框 / 下拉选中态）
    if (!state.voiceSelectionIsManual) {
      ensureVoiceSelected();
      filterVoices('');
    }
  });
}
