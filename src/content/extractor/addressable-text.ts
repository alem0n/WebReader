/**
 * 可寻址文本节点（句子↔DOM 精确对齐的基础）。
 *
 * 这些节点的 nodeValue 按序拼接即 TextUnit.text，句子映射层据此把每句话映射到
 * **精确的字符区间**，网页内逐句高亮按区间回指 DOM（见 reading-overlay.ts）。
 * 因此本模块与 reading-overlay 的拆包/还原逻辑共用同一份「文本 = 节点拼接」约定，
 * 任何调整都要同步两边。
 */

/** 收集可寻址文本节点时跳过的元素：不可朗读/无意义/本扩展自身注入的节点 */
const ADDRESSABLE_IGNORE_SELECTOR =
  'script, style, noscript, template, select, textarea, button, option, ' + 'span.tts-reading-sentence, [contenteditable="true"]';

/**
 * 收集元素内的「可寻址文本节点」：文档序、跳过隐藏子树与不可朗读元素。
 *
 * @param element 待收集的根元素
 * @returns 文档序排列的文本节点数组
 */
export function collectAddressableNodes(element: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(ADDRESSABLE_IGNORE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (!isSubtreeRendered(parent, element)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}

/** 元素及其内部（到 root 为止）是否实际渲染：display:none / visibility:hidden / opacity:0 视为不可见 */
function isSubtreeRendered(el: Element, root: Element): boolean {
  let cur: Element | null = el;
  while (cur && cur !== root) {
    try {
      const style = window.getComputedStyle(cur);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0')
        return false;
    } catch {
      // computed style 不可用时按可见处理（jsdom 等无布局环境）
    }
    cur = cur.parentElement;
  }
  return true;
}

/** 拼接可寻址文本节点，得到与 DOM 逐字对齐的「可寻址文本」 */
export function readAddressableText(element: Element): string {
  return collectAddressableNodes(element)
    .map((n) => n.nodeValue || '')
    .join('');
}

/** 透明元素不可见，不参与朗读（与旧 collectPageText 行为对齐） */
export function isVisibleUnit(unit: Element): boolean {
  try {
    const opacity = window.getComputedStyle(unit).opacity;
    if (opacity === '0') return false;
  } catch {
    // computed style 不可用时按可见处理
  }
  return true;
}
