/**
 * background → content 的消息下发封装（plan.md 阶段 3）。
 *
 * 借鉴 kiss-translator libs/msg.js 的 sendTabMsg 范式：统一 chrome.tabs.query +
 * sendMessage，并对「Could not establish connection / Receiving end does not exist」
 * 做静默或回执兜底（content script 未注入 / 扩展刚更新未刷新页面时必然出现）。
 */
import type { ToggleWidgetResponse } from '../shared/types';

/** 浏览器内部页面：无法注入 content script，悬浮窗 / 右键朗读均不可用 */
const INTERNAL_URL_PREFIXES = ['chrome://', 'edge://', 'about:', 'chrome-extension://'];

function isInternalUrl(url: string | undefined): boolean {
  return !!url && INTERNAL_URL_PREFIXES.some((p) => url.startsWith(p));
}

/** 取当前活动标签页（无活动页时返回 null） */
function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve((tabs && tabs[0]) || null);
    });
  });
}

/**
 * 向当前活动标签页的 content script 发送消息。
 *
 * @param message 消息体（至少含 action）
 * @param sendResponse 可选回执：提供时按 success/error 回应调用方（如 popup 的悬浮窗开关）；
 *                     不提供时静默处理接收端不存在（如 Key 保存广播、右键朗读）
 */
export async function sendToTab(
  message: { action: string; [key: string]: unknown },
  sendResponse?: (response: ToggleWidgetResponse) => void
): Promise<void> {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    sendResponse?.({ success: false, error: 'No active tab' });
    return;
  }

  if (isInternalUrl(tab.url)) {
    sendResponse?.({ success: false, error: '该页面不支持网页悬浮窗（浏览器内部页面）' });
    return;
  }

  chrome.tabs.sendMessage(tab.id, message, () => {
    const err = chrome.runtime.lastError;
    if (sendResponse) {
      if (err && err.message && err.message.includes('Could not establish connection')) {
        sendResponse({ success: false, error: '当前页面未注入悬浮窗脚本，请刷新页面后重试' });
        return;
      }
      sendResponse({ success: true });
      return;
    }
    // 无回执路径：接收端不存在时忽略（页面未注入内容脚本）
    void err;
  });
}
