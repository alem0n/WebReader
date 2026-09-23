/** selection (migrated from content.js) */
import { state } from './state';
import { createWidget, getWidget } from './widget';
import { addTextToTextareaAndPlay } from './text-input';
import { sendToBackground } from '../shared/messaging';
import type { ApiKeyStatusResponse } from '../shared/types';
import { debounce } from '../shared/utils';
import { createContentLogger } from './log';
import * as localTts from '../shared/local-tts';

const logger = createContentLogger('selection');

/**
 * 扩展上下文失效时给用户的轻量提示。
 *
 * 扩展被重新加载/更新（或禁用）后，停留在旧页面的 content script 依然在运行，
 * 但它的 chrome.runtime 句柄已经失效，任何 chrome.* 调用都会抛出
 * "Extension context invalidated"（widget 本身也依赖 chrome.runtime.getURL，同样建不出来）。
 * 因此这里只用纯 DOM 创建提示条，引导用户刷新页面重新注入脚本。
 */
function showContextInvalidatedToast(): void {
  const toastId = 'tts-context-invalidated-toast';
  document.getElementById(toastId)?.remove();

  const toast = document.createElement('div');
  toast.id = toastId;
  toast.textContent = '插件已被重新加载或更新，请刷新当前页面后重试。';
  toast.style.cssText = [
    'all:initial',
    'position:fixed',
    'bottom:24px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:10000001',
    'max-width:min(90vw, 480px)',
    'padding:12px 20px',
    'border-radius:10px',
    'background:rgba(0,4,55,0.96)',
    'color:#ffffff',
    'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif',
    'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
    'pointer-events:auto',
  ].join(';');

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

const SELECTION_BUTTON_STYLES = `
    #tts-selection-button {
      background: #58cc02;
      border: 2px solid #ffffff;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin: 0;
      transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s ease;
      z-index: 10000000 !important;
      position: fixed !important;
      animation: ttsButtonAppear 0.25s ease-out;
      color: #ffffff;
      pointer-events: auto !important;
      visibility: visible !important;
      opacity: 1 !important;
      display: flex !important;
    }

    #tts-selection-button span {
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    #tts-selection-button svg {
      fill: #ffffff;
      pointer-events: none;
    }

    #tts-selection-button:hover {
      background: #58cc02;
      filter: brightness(0.92);
      transform: scale(1.12) translateY(-2px);
    }

    #tts-selection-button:active {
      transform: scale(1.04) translateY(0);
    }

    @keyframes ttsButtonAppear {
      from {
        opacity: 0;
        transform: scale(0.6) translateY(-8px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
  `;

export function injectSelectionButtonStyles() {}

export function toggleWidget() {
  const existingWidget = getWidget();
  if (existingWidget) {
    existingWidget.style.display = existingWidget.style.display === 'none' ? 'block' : 'none';
  } else {
    createWidget();
  }
}

async function ensureWidgetShowsLoginScreen() {
  if (!getWidget()) {
    await createWidget();
  }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (typeof window.edgeTTSShowWidgetLogin === 'function') {
      window.edgeTTSShowWidgetLogin();
      return;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  logger.warn('Widget API key helper not ready in time');
}

/**
 * 延迟显示选区按钮（防抖：连续拖选过程中只在停顿后执行一次，
 * 且显示时重新读取最新选区，保证按钮位置与选区一致）。
 */
const debouncedShowSelectionButton = debounce(() => {
  const currentSelection = window.getSelection();
  const currentText = currentSelection!.toString().trim();

  if (currentText.length > 0 && currentSelection!.rangeCount > 0) {
    state.selectionRange = currentSelection!.getRangeAt(0).cloneRange();
    showSelectionButton(state.selectionRange);
  }
}, 500);

/** 选区变化后延迟检查（防抖：避免拖选过程中频繁移除按钮） */
const debouncedCheckEmptySelection = debounce(() => {
  const selection = window.getSelection();
  const selectedText = selection!.toString().trim();

  // Only remove button if selection is truly empty
  if (selectedText.length === 0 && state.selectionButton) {
    removeSelectionButton();
  }
}, 100);

export function handleTextSelection() {
  const selection = window.getSelection();
  const selectedText = selection!.toString().trim();

  // Remove existing button immediately
  removeSelectionButton();

  // Green FAB for any non-empty selection; auth is checked only when the user clicks it.
  if (selectedText.length > 0 && selection!.rangeCount > 0) {
    // Store the range
    state.selectionRange = selection!.getRangeAt(0).cloneRange();

    // 延迟 500ms 显示按钮，给连选过程留出停顿窗口
    debouncedShowSelectionButton();
  }
}

/**
 * 最近一次左键抬起的视口坐标（时间戳用于判断新鲜度）。
 *
 * 划词按钮优先出现在用户松开左键的位置（跟手）；拿不到时（如键盘选区、
 * 程序化选区）才回退到选区结束位置。
 */
let lastLeftMouseUp: { x: number; y: number; t: number } | null = null;

document.addEventListener(
  'mouseup',
  (e: MouseEvent) => {
    if (e.button !== 0) return; // 只记录左键
    lastLeftMouseUp = { x: e.clientX, y: e.clientY, t: Date.now() };
  },
  { passive: true }
);

/** 鼠标抬起坐标在 1.5 秒内才算有效锚点（超出说明期间有其它交互） */
const MOUSE_UP_FRESH_MS = 1500;

/** 取选区结束位置的视口坐标（collapsed 到 end，取最右端，纵向居中） */
function selectionEndAnchor(range: any): { x: number; y: number } {
  try {
    const endRange = range.cloneRange();
    endRange.collapse(false); // Collapse to end

    const caretRects = endRange.getClientRects();
    if (caretRects.length > 0) {
      const r = caretRects[0];
      return { x: r.right || r.left, y: r.top + r.height / 2 };
    }

    const endRect = endRange.getBoundingClientRect();
    if (endRect && (endRect.width > 0 || endRect.height > 0)) {
      return { x: endRect.right || endRect.left, y: endRect.top + endRect.height / 2 };
    }

    // collapsed range 无可用矩形时，取选区所有矩形中最右侧者
    const selectionRects = range.getClientRects();
    if (selectionRects.length > 0) {
      let rightmost = selectionRects[0];
      for (let i = 1; i < selectionRects.length; i++) {
        if (selectionRects[i].right > rightmost.right) rightmost = selectionRects[i];
      }
      return { x: rightmost.right, y: rightmost.top + rightmost.height / 2 };
    }

    const bounding = range.getBoundingClientRect();
    return { x: bounding.right, y: bounding.top + bounding.height / 2 };
  } catch (e) {
    const bounding = range.getBoundingClientRect();
    return { x: bounding.right, y: bounding.top + bounding.height / 2 };
  }
}

export function showSelectionButton(range: any) {
  // 优先用最近一次左键抬起的视口坐标定位按钮（跟随用户手的位置），
  // 拿不到或已过期（如键盘选区）再回退到选区结束位置。
  const anchor =
    lastLeftMouseUp && Date.now() - lastLeftMouseUp.t < MOUSE_UP_FRESH_MS
      ? { x: lastLeftMouseUp.x, y: lastLeftMouseUp.y }
      : selectionEndAnchor(range);
  // Create Shadow DOM host for style isolation
  const host = document.createElement('div');
  host.id = 'tts-selection-button-host';
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:10000000';
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = SELECTION_BUTTON_STYLES;
  shadowRoot.appendChild(styleEl);

  // Create button element
  const button = document.createElement('button');
  button.id = 'tts-selection-button';
  // Play icon（加粗描边风格，与悬浮窗图标一致）
  button.innerHTML =
    '<span><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>';
  button.title = 'Add selected text and play';
  button.setAttribute('aria-label', 'Add selected text and play');

  // 定位锚点：优先用左键抬起位置，否则回退到选区结束位置
  const endX = anchor.x;
  const endY = anchor.y;

  // For fixed positioning, use getBoundingClientRect directly (already relative to viewport)
  button.style.position = 'fixed';
  button.style.zIndex = '10000000'; // Higher z-index to ensure visibility
  button.style.pointerEvents = 'auto';
  button.style.display = 'flex'; // Ensure button is visible
  button.style.visibility = 'visible';
  button.style.opacity = '1';

  // 按钮落在锚点右上侧：跟手（左键抬起处）时几乎不用移动鼠标就能点到
  let left = endX + 12; // 12px offset to the right of anchor
  let top = endY - 24; // Center button vertically (button is 40px, offset above)

  // Adjust if button would go off screen (bottom)
  if (top + 40 > window.innerHeight) {
    top = endY - 45; // Show above instead (button height is 40px, so 45px above center)
  }

  // Ensure button doesn't go off right edge
  if (left + 40 > window.innerWidth) {
    // Show to the left of selection instead
    left = Math.max(endX - 48, 8); // 40px button + 8px spacing
  }

  // Ensure button doesn't go off left edge
  if (left < 8) {
    left = 8;
  }

  // Ensure button doesn't go off top edge
  if (top < 8) {
    // Show below the selection instead
    top = Math.min(endY + 20, window.innerHeight - 48); // Below center, but within screen
  }

  button.style.left = left + 'px';
  button.style.top = top + 'px';

  // Append button to shadow root, then host to body (Shadow DOM isolates styles)
  shadowRoot.appendChild(button);
  document.body.appendChild(host);

  // Update position on scroll and resize
  const updatePosition = () => {
    if (!state.selectionButton || !state.selectionRange) return;
    try {
      // 滚动 / 缩放后鼠标抬起坐标已失效，改回跟随选区结束位置
      const { x: endX, y: endY } = selectionEndAnchor(state.selectionRange);

      let left = endX + 12;
      let top = endY - 24;

      if (top + 40 > window.innerHeight) {
        top = endY - 45; // 越界时改到上方
      }
      if (left + 40 > window.innerWidth) {
        left = Math.max(endX - 48, 8); // 越右边界改到左侧
      }
      if (left < 8) {
        left = 8;
      }
      if (top < 8) {
        top = Math.min(endY + 20, window.innerHeight - 48); // 越顶边界改到下方
      }

      button.style.left = left + 'px';
      button.style.top = top + 'px';
    } catch (e) {
      // Range 可能已失效，移除按钮
      removeSelectionButton();
    }
  };

  window.addEventListener('scroll', updatePosition, { passive: true });
  window.addEventListener('resize', updatePosition);

  // Store cleanup function
  (button as any)._cleanupPosition = () => {
    window.removeEventListener('scroll', updatePosition);
    window.removeEventListener('resize', updatePosition);
  };

  // Add click handler — if not logged in, open widget with login instead of playing
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection();
    const selectedText = selection!.toString().trim();
    if (!selectedText) {
      removeSelectionButton();
      selection!.removeAllRanges();
      return;
    }

    const finish = () => {
      removeSelectionButton();
      selection!.removeAllRanges();
    };

    // 检查 API Key 是否已配置（模仿原登录流程：未登录则先登录）。
    // 注意：扩展被重新加载/更新后，停留在旧页面的 content script 会失效，
    // chrome.runtime.sendMessage 会同步抛出 "Extension context invalidated"。
    // 这里经 sendToBackground 包装（Promise 执行器会把同步抛出转为 rejected），
    // 并在上下文失效时提示用户刷新页面，而不是让错误未捕获。
    let hasKey = false;
    try {
      const response = await sendToBackground<ApiKeyStatusResponse>({ action: 'checkApiKeyStatus' });
      hasKey = !!(response && response.hasKey);
    } catch (err) {
      logger.warn('Failed to check API key status:', err);
      showContextInvalidatedToast();
      finish();
      return;
    }

    if (!hasKey) {
      // 未配置 API Key：本地音色可用时直接朗读（开箱即用），否则弹出 widget 配 Key
      if (localTts.canSpeak()) {
        addTextToTextareaAndPlay(selectedText);
      } else {
        try {
          await ensureWidgetShowsLoginScreen();
        } catch (err) {
          logger.warn('Failed to show API key screen:', err);
          showContextInvalidatedToast();
        }
      }
      finish();
      return;
    }
    try {
      addTextToTextareaAndPlay(selectedText);
    } catch (err) {
      logger.warn('Failed to play selected text:', err);
    }
    finish();
  });

  state.selectionButton = button;

  // Hide button when clicking elsewhere or changing selection
  // Use a small delay to ensure button is fully rendered
  setTimeout(() => {
    document.addEventListener('click', hideSelectionButtonOnClick, true);
    document.addEventListener('selectionchange', handleSelectionChange, true);
  }, 50);
}

function handleSelectionChange() {
  // 防抖：拖选过程中等选区稳定后再检查是否为空
  debouncedCheckEmptySelection();
}

function hideSelectionButtonOnClick(e: any) {
  if (state.selectionButton && !state.selectionButton.contains(e.target as any)) {
    const selection = window.getSelection();
    const selectedText = selection!.toString().trim();

    // Only hide if clicking outside selected text area or no selection
    if (selectedText.length === 0 || !isClickInSelection(e)) {
      removeSelectionButton();
      document.removeEventListener('click', hideSelectionButtonOnClick, true);
    }
  }
}

function isClickInSelection(e: any) {
  if (!state.selectionRange) return false;
  const rect = state.selectionRange.getBoundingClientRect();
  return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
}

function removeSelectionButton() {
  // 取消待执行的延迟显示 / 空选区检查
  debouncedShowSelectionButton.cancel();
  debouncedCheckEmptySelection.cancel();

  if (state.selectionButton) {
    // Cleanup position listeners if they exist
    if ((state.selectionButton as any)._cleanupPosition) {
      (state.selectionButton as any)._cleanupPosition();
    }

    // Remove host from DOM (button is inside Shadow DOM)
    const host = (state.selectionButton.getRootNode() as any).host;
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }

    state.selectionButton = null;
    state.selectionRange = null;
    document.removeEventListener('click', hideSelectionButtonOnClick, true);
    document.removeEventListener('selectionchange', handleSelectionChange);
  }
}
