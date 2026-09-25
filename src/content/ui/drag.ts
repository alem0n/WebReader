/** 悬浮窗拖拽：按指针位移平移窗口，最小化的 scale 变换在拖拽中保留 */
import { getWidget } from '../widget';
import { state } from '../state';

export function dragStart(e: any) {
  // Don't drag if clicking on interactive elements
  if (
    (e.target as any).closest('button') ||
    (e.target as any).closest('input') ||
    (e.target as any).closest('select') ||
    (e.target as any).closest('label') ||
    (e.target as any).closest('.dropdown-list') ||
    (e.target as any).closest('.voice-option') ||
    (e.target as any).closest('.btn') ||
    (e.target as any).closest('.text-content') ||
    (e.target as any).closest('.user-menu')
  ) {
    return;
  }

  state.initialX = e.clientX - state.xOffset;
  state.initialY = e.clientY - state.yOffset;
  state.isDragging = true;
  getWidget()?.classList.add('dragging');
}

export function drag(e: any) {
  if (state.isDragging) {
    e.preventDefault();
    state.currentX = e.clientX - state.initialX;
    state.currentY = e.clientY - state.initialY;

    state.xOffset = state.currentX;
    state.yOffset = state.currentY;

    setTranslate(state.currentX, state.currentY, getWidget());
  }
}

export function dragEnd(_e: any) {
  state.initialX = state.currentX;
  state.initialY = state.currentY;
  state.isDragging = false;
  getWidget()?.classList.remove('dragging');
}

function setTranslate(xPos: any, yPos: any, el: any) {
  // Preserve scale if minimized
  const currentTransform = el.style.transform || '';
  const scaleMatch = currentTransform.match(/scale\([^)]+\)/);
  const scale = scaleMatch ? ' ' + scaleMatch[0] : '';
  el.style.transform = `translate(${xPos}px, ${yPos}px)${scale}`;
}
