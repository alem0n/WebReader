/**
 * page-fab.ts — 页面内「朗读整页」悬浮按钮
 *
 * 在网页上提供直接入口：点击即识别正文并朗读，无需先打开插件主界面或悬浮窗。
 * 样式用 Shadow DOM 隔离（与选区按钮 selection.ts 一致）。
 *
 * 显示策略：页面存在可采集正文时才出现。内容探测放在 idle 回调里做，
 * 不阻塞首屏；并对 SPA 懒加载做一次延迟兜底探测。
 *
 * 交互：
 * - 可拖动（Pointer Events，鼠标 / 触摸通用）
 * - 3 秒无点击自动吸附到最近的左右边缘，只留一段圆弧作为触发区
 * - 鼠标悬停或按下露出的圆弧即回弹归位；点击仍触发朗读
 */
import { i18n } from './i18n';
import { collectPageText, playEntirePage } from './player';
import { scheduleIdle } from '../shared/utils';
import { createContentLogger } from './log';

const logger = createContentLogger('page-fab');

const HOST_ID = 'tts-read-page-fab-host';

/** 按钮尺寸（与 CSS 保持一致） */
const SIZE = 46;
/** 展开态离视口边缘的距离 */
const EDGE_MARGIN = 14;
/** 吸附后露出的圆弧宽度 */
const SNAP_VISIBLE = 16;
/** 吸附时藏起的宽度 */
const SNAP_HIDE = SIZE - SNAP_VISIBLE;
/** 多久无点击就吸附边缘 */
const IDLE_MS = 3000;
/** 拖动距离阈值：小于此值视为点击 */
const DRAG_THRESHOLD = 6;

let host: HTMLDivElement | null = null;
let button: HTMLButtonElement | null = null;
let probing = false;

/** 按钮左上角视口坐标 */
let pos = { x: 0, y: 0 };
/** 拖动起点（指针坐标与按钮坐标） */
let pointerStart = { x: 0, y: 0 };
let posStart = { x: 0, y: 0 };
let dragging = false;
let moved = false;
/** 当前是否吸附在边缘 */
let snapped = false;
let snapSide: 'left' | 'right' = 'right';
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 初始化：安排内容探测，有正文时才显示悬浮按钮。
 */
export function initPageFab(): void {
  if (host !== null || probing) return;
  probing = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleProbe(0), { once: true });
  } else {
    scheduleProbe(0);
  }
  // SPA 懒加载兜底：稍后再探一次
  scheduleProbe(2500);
}

function scheduleProbe(delay: number): void {
  const run = () => {
    if (host !== null) return; // 已显示
    try {
      if (collectPageText().trim().length > 0) showFab();
    } catch (err) {
      logger.warn('内容探测失败:', err);
    }
  };
  if (delay > 0) {
    setTimeout(run, delay);
    return;
  }
  // 空闲时执行，避免影响首屏渲染（不支持 requestIdleCallback 时自动降级 setTimeout）
  scheduleIdle(run, 3000);
}

/** 读取「朗读整页」的界面文案；i18n 未就绪时退化为英文键名，保证按钮始终可用 */
function readEntirePageLabel(): string {
  try {
    return i18n('read_entire_page') || 'read_entire_page';
  } catch {
    return 'read_entire_page';
  }
}

/** 把坐标限制在视口内，保证按钮始终可触达 */
function clampPos(x: number, y: number): { x: number; y: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.max(0, Math.min(x, w - SIZE)),
    y: Math.max(0, Math.min(y, h - SIZE)),
  };
}

function applyPos(): void {
  if (!button) return;
  button.style.left = pos.x + 'px';
  button.style.top = pos.y + 'px';
}

/** 重新计时：3 秒无点击后吸附到最近边缘 */
function armIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(snapToEdge, IDLE_MS);
}

/** 吸附到最近边缘，只露出一段圆弧 */
function snapToEdge(): void {
  if (!button) return;
  snapped = true;
  const centerX = pos.x + SIZE / 2;
  snapSide = centerX < window.innerWidth / 2 ? 'left' : 'right';
  button.style.transform = snapSide === 'left' ? `translateX(${-SNAP_HIDE}px)` : `translateX(${SNAP_HIDE}px)`;
}

/** 回弹归位（露出完整按钮） */
function popOut(): void {
  if (!button || !snapped) return;
  snapped = false;
  button.style.transform = 'translateX(0)';
}

function showFab(): void {
  if (host !== null) return;

  host = document.createElement('div');
  host.id = HOST_ID;
  // 宿主是 0x0 的 fixed 锚点，按钮以视口坐标绝对定位，可自由拖动与溢出
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:10000000';

  const shadowRoot = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    button {
      all: unset;
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: ${SIZE}px;
      height: ${SIZE}px;
      border-radius: 50%;
      background: #58cc02;
      border: 2px solid #ffffff;
      cursor: grab;
      pointer-events: auto;
      opacity: 0.9;
      color: #ffffff;
      /* 仅对吸附/回弹的位移做动画，拖动时临时关掉 */
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease, background 0.15s ease;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    button:hover { opacity: 1; filter: brightness(0.92); }
    button:active { cursor: grabbing; }
    button svg {
      width: 24px;
      height: 24px;
      pointer-events: none;
      user-select: none;
    }
  `;

  const label = readEntirePageLabel();
  button = document.createElement('button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);

  // 加粗描边风格的「文档 + 播放」图标，与悬浮窗按钮一致
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M6 2.5h8L20 8.5v13H6V2.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M14 2.5v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M15 17l3.5-2v4L15 17z" fill="currentColor"/>' +
    '</svg>';

  // 默认停在右下角
  pos = clampPos(window.innerWidth - SIZE - EDGE_MARGIN, window.innerHeight - SIZE - EDGE_MARGIN);
  applyPos();

  // ---------- 拖动（Pointer Events，鼠标 / 触摸通用） ----------
  button.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return; // 只响应左键 / 主指针
    e.preventDefault();
    e.stopPropagation();

    dragging = true;
    moved = false;
    pointerStart = { x: e.clientX, y: e.clientY };
    posStart = { ...pos };
    try {
      // 捕获指针，保证拖到按钮外面也能持续收到 move / up
      button!.setPointerCapture(e.pointerId);
    } catch (err) {
      logger.debug('setPointerCapture skipped:', err);
    }
    // 拖动期间禁用位移动画，跟手
    button!.style.transition = 'opacity 0.15s ease, background 0.15s ease';
    // 按下露出的圆弧即回弹归位
    popOut();
  });

  button.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) moved = true;
    pos = clampPos(posStart.x + dx, posStart.y + dy);
    applyPos();
  });

  const endPointer = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    e.preventDefault();
    e.stopPropagation();
    if (button) button.style.transition = '';
    // 未移动 → 视为点击，触发朗读
    if (!moved) playEntirePage();
    // 无论点击还是拖动结束，都重新计时吸附
    armIdleTimer();
  };
  button.addEventListener('pointerup', endPointer);
  button.addEventListener('pointercancel', endPointer);

  // ---------- 边缘吸附的回弹触发 ----------
  // 鼠标悬停露出的圆弧 → 回弹（触摸设备无 hover，按下时由 pointerdown 回弹）
  button.addEventListener('mouseenter', () => popOut());
  // 鼠标离开后重新计时，3 秒无点击再次吸附
  button.addEventListener('mouseleave', () => {
    if (!snapped) armIdleTimer();
  });

  // 视口尺寸变化：按钮保持可触达；吸附态则按新宽度重新对齐边缘
  window.addEventListener('resize', () => {
    pos = clampPos(pos.x, pos.y);
    applyPos();
    if (snapped) {
      const centerX = pos.x + SIZE / 2;
      snapSide = centerX < window.innerWidth / 2 ? 'left' : 'right';
      if (button) {
        button.style.transform = snapSide === 'left' ? `translateX(${-SNAP_HIDE}px)` : `translateX(${SNAP_HIDE}px)`;
      }
    }
  });

  shadowRoot.appendChild(style);
  shadowRoot.appendChild(button);
  document.body.appendChild(host);

  // 首次出现即开始计时：3 秒无点击吸附到边缘
  armIdleTimer();
}
