/** 禁用元素的悬停提示：播放/加载期间被禁用的控件在悬停时提示「停止后可启用」 */
import { getWidgetElementById } from '../widget';
import { state } from '../state';
import { i18n } from '../i18n';

export function setupDisabledTooltips() {
  // Remove old handlers
  state.tooltipHandlers.forEach(({ element, enter, leave }) => {
    element.removeEventListener('mouseenter', enter);
    element.removeEventListener('mouseleave', leave);
  });
  state.tooltipHandlers = [];

  // Tooltip for voice search
  state.voiceSearchInput = getWidgetElementById('voice-search') as any;
  if (state.voiceSearchInput && (state.voiceSearchInput as any).disabled) {
    const dropdownContainer = state.voiceSearchInput.closest('.dropdown-container');
    const targetElement = dropdownContainer || state.voiceSearchInput;
    const showHandler = (e: any) => showTooltip(e, targetElement);
    const hideHandler = hideTooltip;
    targetElement.addEventListener('mouseenter', showHandler);
    targetElement.addEventListener('mouseleave', hideHandler);
    state.tooltipHandlers.push({ element: targetElement as HTMLElement, enter: showHandler, leave: hideHandler });
  }

  // Tooltip for speed select
  state.speedSelect = getWidgetElementById('speed-select') as any;
  if (state.speedSelect && (state.speedSelect as any).disabled) {
    const showHandler = (e: any) => showTooltip(e, state.speedSelect);
    const hideHandler = hideTooltip;
    state.speedSelect.addEventListener('mouseenter', showHandler);
    state.speedSelect.addEventListener('mouseleave', hideHandler);
    state.tooltipHandlers.push({ element: state.speedSelect, enter: showHandler, leave: hideHandler });
  }

  // Tooltip for checkboxes（开关数据驱动渲染后统一在 toggleCheckboxes 中；渲染前调用则空表跳过）
  for (const cb of Object.values(state.toggleCheckboxes)) {
    if (!(cb as any).disabled) continue;
    const checkboxLabel = cb.closest('.checkbox-label');
    if (!checkboxLabel) continue;
    const showHandler = (e: any) => showTooltip(e, checkboxLabel);
    const hideHandler = hideTooltip;
    checkboxLabel.addEventListener('mouseenter', showHandler);
    checkboxLabel.addEventListener('mouseleave', hideHandler);
    state.tooltipHandlers.push({ element: checkboxLabel as HTMLElement, enter: showHandler, leave: hideHandler });
  }
}

function showTooltip(_e: any, element: any, customText: any = null) {
  if (state.currentTooltip) {
    hideTooltip();
  }

  if (!element) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'tts-tooltip';
  tooltip.textContent = customText || i18n('click_stop_to_enable');
  const root = window.ttsWidgetShadowRoot || document.body;
  root.appendChild(tooltip);

  const rect = element.getBoundingClientRect();
  tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
  tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';

  // Adjust if tooltip goes off screen
  setTimeout(() => {
    if (parseInt(tooltip.style.left) < 10) {
      tooltip.style.left = rect.left + 'px';
    }
    if (parseInt(tooltip.style.left) + tooltip.offsetWidth > window.innerWidth - 10) {
      tooltip.style.left = rect.right - tooltip.offsetWidth + 'px';
    }
    tooltip.classList.add('show');
  }, 10);

  state.currentTooltip = { element, tooltip };
}

function hideTooltip() {
  if (state.currentTooltip && (state.currentTooltip as any).tooltip) {
    (state.currentTooltip as any).tooltip.remove();
    state.currentTooltip = null;
  }
}
