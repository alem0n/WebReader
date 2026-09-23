/**
 * 悬浮窗内「开关型配置」的渲染与事件绑定（数据驱动）。
 *
 * 遍历 shared/toggle-settings 声明表生成 checkbox：新增开关只需在声明表追加一项，
 * 悬浮窗与 popup 主界面即自动出现对应开关，不必再改两处界面模板。文案、默认值、
 * 从属联动（dependsOn）全部来自声明；各开关的额外副作用（如高亮主开关触发覆盖层
 * 重建）通过 TOGGLE_CHANGE_HANDLERS 集中登记，与通用渲染逻辑解耦。
 */
import { TOGGLE_SETTINGS, type ToggleKey } from '../shared/toggle-settings';
import { state } from './state';
import { saveSettings } from './settings';
import { refreshInlineReading } from './player';
import { updatePlayButtonState, setupDisabledTooltips, highlightFirstSentenceIfNeeded } from './ui';
import { createContentLogger } from './log';

const logger = createContentLogger('toggle-settings');

/** 各开关 change 时的额外副作用（通用逻辑已处理 state 写入、持久化与依赖联动） */
const TOGGLE_CHANGE_HANDLERS: Partial<Record<ToggleKey, (checked: boolean) => void>> = {
  autoDetectLanguage: (checked) => {
    if (checked) {
      // 自动检测接管音色选择：清空已选音色，但保留搜索框显示
      state.selectedVoice = null;
    }
    updatePlayButtonState();
    setupDisabledTooltips();
  },
  removeParentheticals: () => {
    highlightFirstSentenceIfNeeded();
  },
  inlineDisplayEnabled: () => {
    // 开启则重新包裹并高亮当前句；关闭则拆除覆盖层、还原页面
    refreshInlineReading();
  },
};

/** 读取某开关当前是否可用（被依赖开关关闭时禁用） */
function isToggleEnabled(key: ToggleKey): boolean {
  const def = TOGGLE_SETTINGS.find((d) => d.key === key);
  if (!def?.dependsOn) return true;
  return !!(state as Record<ToggleKey, boolean>)[def.dependsOn];
}

/** 同步全部开关的可用状态（主开关变化后更新从属开关，避免「能勾选但不生效」） */
function syncToggleDisabledState(): void {
  for (const def of TOGGLE_SETTINGS) {
    const cb = state.toggleCheckboxes[def.key];
    if (cb) cb.disabled = !isToggleEnabled(def.key);
  }
}

/**
 * 在容器内渲染全部开关型配置（initWidget 创建悬浮窗后调用一次）。
 *
 * 幂等：已渲染过则跳过，避免重复挂载。checkbox 初始勾选与可用状态由 state
 * 与声明表的 dependsOn 决定，与 loadStoredSettings 的读取结果一致。
 */
export function renderToggleSettings(column: HTMLElement | null): void {
  if (!column || Object.keys(state.toggleCheckboxes).length) return;

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

    state.toggleCheckboxes[def.key] = input;

    input.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      (state as Record<ToggleKey, boolean>)[def.key] = checked;
      logger.debug(`${def.key} changed to:`, checked);
      syncToggleDisabledState();
      saveSettings();
      TOGGLE_CHANGE_HANDLERS[def.key]?.(checked);
    });
  }

  // 渲染完成后注册禁用 tooltip（setupDisabledTooltips 内部遍历 toggleCheckboxes）
  setupDisabledTooltips();
}
