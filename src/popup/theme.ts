/**
 * 主页标题栏主题切换（亮 / 暗）。
 *
 * 主题是全局配置：写 chrome.storage.local（INTERFACE_THEME_STORAGE），
 * 已打开的网页悬浮窗通过存储变更监听即时跟随，不再需要在悬浮窗单独切换。
 * 独立于引擎配置状态绑定（未配置 MiMo Key / 后端地址时也必须可用，
 * 与语言切换 / 悬浮窗开关的无条件绑定保持一致）。
 */
import { readInterfaceTheme, writeInterfaceTheme } from '../shared/settings';
import { logger } from './log';

const THEME_TOGGLE_ID = 'theme-toggle-btn';

/** 把主题应用到 popup 自身并切换按钮图标（亮色显月亮、暗色显太阳） */
export function applyTheme(dark: boolean): void {
  document.body.classList.toggle('dark-theme', dark);
  const useEl = document.querySelector(`#${THEME_TOGGLE_ID} use`);
  useEl?.setAttribute('href', dark ? '#icon-sun' : '#icon-moon');
}

/** 读取存储主题回显，并绑定标题栏切换按钮（DOM ready 后调用） */
export async function setupThemeToggle(): Promise<void> {
  const btn = document.getElementById(THEME_TOGGLE_ID);
  if (!btn) {
    logger.warn('Theme toggle button not found');
    return;
  }

  const dark = await readInterfaceTheme();
  applyTheme(dark);

  btn.addEventListener('click', () => {
    const next = !document.body.classList.contains('dark-theme');
    applyTheme(next);
    writeInterfaceTheme(next);
  });
}
