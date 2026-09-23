/**
 * quick-actions.ts — popup「阅读整页 / 从剪贴板粘贴」快捷操作
 *
 * 这两个动作原本在网页悬浮窗的第二排按钮里，因布局精简移到插件主界面：
 * - 阅读整页：经 background 转发到当前标签页的 content（playEntirePage）
 * - 从剪贴板粘贴：剪贴板只能在有用户手势的安全上下文里读，popup 侧读好后把文本
 *   交给 background 转发（playSelectedText）；读剪贴板失败时给出明确提示
 *
 * 文案写死中文（AGENTS.md §1.1）。
 */
import { logger } from './log';

const READ_PAGE_BTN_ID = 'read-page-btn';
const PASTE_READ_BTN_ID = 'paste-read-btn';

/** 3 秒内重复点击只提示一次，避免刷屏 */
let lastStatusTimer: ReturnType<typeof setTimeout> | null = null;

function showStatus(msg: string, isError = false): void {
  const statusEl = document.getElementById('status-text');
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
  if (lastStatusTimer) clearTimeout(lastStatusTimer);
  lastStatusTimer = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.classList.remove('error');
  }, 3000);
}

/** 发送给 background 的统一封装：返回成功 / 失败与错误文案 */
function sendToBackground(message: { action: string; text?: string }): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: any) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response && typeof response === 'object' ? response : { success: false });
    });
  });
}

/** 阅读整页：转发到当前标签页，由 content 采集正文并朗读 */
function handleReadPage(): void {
  void sendToBackground({ action: 'readEntirePageOnActiveTab' }).then((res) => {
    if (res.success) {
      showStatus('已开始朗读当前页面');
    } else {
      logger.warn('readEntirePageOnActiveTab failed:', res.error);
      showStatus(res.error || '当前页面不支持朗读（可能是浏览器内部页面，或请刷新页面后重试）', true);
    }
  });
}

/** 从剪贴板粘贴：popup 侧读剪贴板，再把文本交给 content 朗读 */
function handlePasteRead(): void {
  // navigator.clipboard 在 popup（安全上下文 + 用户点击手势）里可用；
  // 失败多为权限被拒或剪贴板为空，给用户可操作的提示
  void navigator.clipboard
    .readText()
    .then((text) => {
      const trimmed = (text || '').trim();
      if (!trimmed) {
        showStatus('剪贴板是空的，请先复制要朗读的内容', true);
        return;
      }
      return sendToBackground({ action: 'playTextOnActiveTab', text: trimmed }).then((res) => {
        if (res.success) {
          showStatus('已粘贴并开始朗读');
        } else {
          logger.warn('playTextOnActiveTab failed:', res.error);
          showStatus(res.error || '当前页面不支持朗读（可能是浏览器内部页面，或请刷新页面后重试）', true);
        }
      });
    })
    .catch((err: unknown) => {
      logger.warn('clipboard read failed:', err);
      showStatus('无法读取剪贴板，请检查剪贴板权限后重试', true);
    });
}

/** DOM ready 后绑定（不依赖 API Key 是否配置，快捷操作始终可用） */
export function setupQuickActions(): void {
  const readBtn = document.getElementById(READ_PAGE_BTN_ID);
  const pasteBtn = document.getElementById(PASTE_READ_BTN_ID);

  if (readBtn) {
    readBtn.addEventListener('click', () => {
      (readBtn as HTMLButtonElement).disabled = true;
      handleReadPage();
      setTimeout(() => {
        (readBtn as HTMLButtonElement).disabled = false;
      }, 600);
    });
  }

  if (pasteBtn) {
    pasteBtn.addEventListener('click', () => {
      (pasteBtn as HTMLButtonElement).disabled = true;
      handlePasteRead();
      setTimeout(() => {
        (pasteBtn as HTMLButtonElement).disabled = false;
      }, 600);
    });
  }
}
