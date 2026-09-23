/**
 * 右键菜单「朗读选中文字」（plan.md 阶段 3）。
 *
 * content 侧已实现 playSelectedText 消息动作（清洗文本 → 显示悬浮窗 → 轮询重试点播放），
 * 本模块只负责菜单创建与点击路由，content 侧零新开发。
 *
 * 浏览器内置页（chrome:// 等）通过 documentUrlPatterns 排除，菜单不出现；
 * 文案写死中文（AGENTS.md §1.1：不新增 _locales 键）。
 */
import { sendToTab } from './msg';
import { logger } from './log';

const MENU_ID = 'mimo-read-selection';
const MENU_TITLE = '朗读选中文字';

/** 菜单仅在可注入 content script 的页面出现（排除浏览器内部页面） */
const MENU_URL_PATTERNS = ['http://*/*', 'https://*/*', 'file://*/*'];

/**
 * 创建右键菜单。onInstalled 与 Service Worker 启动时各调一次：
 * Chrome 会持久化菜单，重复创建同 id 会抛错，try/catch 忽略即可。
 */
export function ensureContextMenu(): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
  try {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: MENU_TITLE,
      contexts: ['selection'],
      documentUrlPatterns: MENU_URL_PATTERNS,
    });
  } catch (e) {
    // 菜单已存在（SW 重启后再次创建），忽略
    logger.debug('contextMenus.create skipped:', (e as Error).message);
  }
}

/** 监听菜单点击：取选中文本经 sendToTab 下发到 content 的 playSelectedText */
export function setupContextMenuHandler(): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== MENU_ID) return;
    const text = (info.selectionText || '').trim();
    if (!text) return;
    // 右键所在的标签页即活动页；sendToTab 内部对内部页面与接收端不存在均已兜底
    void sendToTab({ action: 'playSelectedText', text });
  });
}
