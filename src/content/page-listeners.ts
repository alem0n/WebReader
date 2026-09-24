/**
 * 页面级（document）委托监听：网页内点击跳转朗读 + 划词选择（模块级，注册一次）。
 *
 * 点击跳转只处理「已 prepare 的句子 span」上的点击：主开关开启且存在句子映射时
 * 才生效；链接/按钮/修饰键/拖选等一律放行浏览器默认行为（详见 resolveClickJumpTarget）。
 * 悬浮窗（Shadow DOM）内点击冒泡到 document 时 target 为 shadow host，
 * findSentenceIndexFromNode 返回 null，天然不误触发。
 */
import { state } from './state';
import { resolveClickJumpTarget } from './reading-overlay';
import { jumpToSentence } from './player';
import { handleTextSelection } from './selection';

/** mousedown 坐标，供 click 时判定是否为拖选文字 */
let pointerDownPos: { x: number; y: number } | null = null;

/** 注册网页内点击跳转的委托监听 */
export function registerClickJumpListener(): void {
  document.addEventListener('mousedown', (e: MouseEvent) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener('click', (e: MouseEvent) => {
    // 无句子映射（选中朗读/粘贴/未朗读过）或主开关关闭：完全不干预页面点击
    if (!state.inlineDisplayEnabled) return;
    const map = state.pageTextMap;
    if (!map) return;

    const targetIndex = resolveClickJumpTarget(e, map, pointerDownPos);
    if (targetIndex === null) return;

    // 命中句子 span：跳转朗读。不 preventDefault —— span 无默认行为，
    // 被排除的链接/按钮早已在上面放行。
    jumpToSentence(targetIndex);
  });
}

/** 注册划词选择监听（selectionchange + mouseup 双保险） */
export function registerSelectionListener(): void {
  // Text selection: green FAB always plays immediately (login removed, see showSelectionButton).
  document.addEventListener('selectionchange', () => {
    handleTextSelection();
  });

  // Also listen for mouseup to catch selections
  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      handleTextSelection();
    }, 10);
  });
}
