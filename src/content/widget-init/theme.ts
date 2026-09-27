/**
 * 悬浮窗外观：主题（亮 / 暗）与收起（minimized）。
 *
 * 主题统一存 chrome.storage.local（INTERFACE_THEME_STORAGE），切换入口在
 * popup 主页标题栏；悬浮窗创建时按存储主题打上 dark-theme 类（见 widget/index.ts），
 * 主页切换后由 storage-sync 监听调用 applyWidgetTheme 即时跟随。
 * 收起态全部由 .minimized 类驱动（隐藏哪些元素、宽度与内边距见 widget 样式表），
 * 收起时保留 translate 并叠加 scale，避免拖拽位移被重置。
 */
import { state } from '../state';
import { getWidget } from '../widget';
import { i18n } from '../i18n';

/**
 * 主题应用到悬浮窗（dark-theme 类的增删是唯一变化来源）。
 *
 * 创建时已按存储主题初始化该类，此处只同步 state；主页切换主题后
 * 由 storage-sync 的存储变更监听调用本函数。
 */
export function applyWidgetTheme(dark: boolean): void {
  const widget = getWidget();
  widget?.classList.toggle('dark-theme', dark);
}

/** 收起 / 展开：按钮在头部与播放控制行之间移动，transform 只保留 translate */
export function initMinimize(widget: HTMLElement): void {
  state.isMinimized = false;

  state.minimizeBtn!.addEventListener('click', () => {
    state.isMinimized = !state.isMinimized;

    const minimizeIcon = state.minimizeBtn!.querySelector('use') as any;
    const headerButtons = widget.querySelector('.header-buttons');
    const playerControls = widget.querySelector('.player-controls');
    const currentTransform = widget.style.transform || '';
    const translateMatch = currentTransform.match(/translate\([^)]+\)/);
    const currentTranslate = translateMatch ? translateMatch[0] : '';

    // 收起态全部由 .minimized 类驱动（隐藏哪些元素、宽度与内边距见 widget 样式表）
    widget.classList.toggle('minimized', state.isMinimized);

    if (state.isMinimized) {
      // 恢复按钮挪进播放控制行并隐藏整个头部，把上中下三层并为两层
      if (playerControls && state.minimizeBtn!.parentElement !== playerControls) {
        playerControls.appendChild(state.minimizeBtn!);
      }
      widget.style.transform = `${currentTranslate} scale(0.8625)`.trim();
      widget.style.transformOrigin = 'top right';
      if (minimizeIcon) minimizeIcon.setAttribute('href', '#icon-expand');
      state.minimizeBtn!.title = i18n('expand');
    } else {
      // 恢复按钮回到头部原位（.header-buttons 的第一个子节点）
      if (headerButtons && state.minimizeBtn!.parentElement !== headerButtons) {
        headerButtons.insertBefore(state.minimizeBtn!, headerButtons.firstChild);
      }
      widget.style.transform = currentTranslate || '';
      widget.style.transformOrigin = '';
      if (minimizeIcon) minimizeIcon.setAttribute('href', '#icon-minimize');
      state.minimizeBtn!.title = i18n('minimize');
    }
  });
}
