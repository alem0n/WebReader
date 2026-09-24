/**
 * 核心遍历（移植自 translationTargets.js 的 visitTranslationTargets，
 * 增加关键改造：命中即采集、不下钻子树）。
 *
 * 与 kiss 原始算法的刻意差异：翻译场景允许嵌套节点各自重复翻译，
 * 朗读场景重叠文本会导致重复朗读，因此本遍历命中后不再下钻子树，
 * 保证输出非重叠的文档序单元。
 */

export interface CollectOptions {
  autoScan: string;
  selector: string;
  ignoreSelector: string;
  isBlock: (el: Element) => boolean;
  hasText: (el: Element) => boolean;
}

/**
 * 自顶向下遍历 DOM，把页面拆成最小块级文本单元。
 *
 * autoScan === "false"：纯 selector 模式，匹配选择器的元素即为单元
 *   （文档序遍历，已采集节点的后代自动跳过，避免嵌套重叠）。
 * autoScan !== "false"：智能扫描模式，栈式 DFS：
 *   - 命中（有直接文本，或全部子元素非块级）→ 采集，且不再下钻子树；
 *   - 无直接文本且仅一个元素子节点 → 下钻（穿透包装层）；
 *   - 无直接文本且含块级子元素 → 继续拆分块级子节点。
 *
 * 采集是**只读**的：不注入或修改任何 DOM。
 */
export function collectTargets(root: Node, options: CollectOptions, collect: (el: Element) => void): void {
  const { autoScan, selector, ignoreSelector, isBlock, hasText } = options;
  if (!root) return;
  if (root.nodeType !== 1 && root.nodeType !== 11) return; // ELEMENT_NODE / DOCUMENT_FRAGMENT

  const rootEl = root as Element;
  if (rootEl.closest?.(ignoreSelector)) return;

  if (autoScan === 'false') {
    const sel = selector.trim();
    if (!sel) return;

    let lastCollected: Element | null = null;
    if (rootEl.matches?.(sel) && !rootEl.closest(ignoreSelector)) {
      collect(rootEl);
      lastCollected = rootEl;
    }
    rootEl.querySelectorAll?.(sel).forEach((node) => {
      if (node.closest(ignoreSelector)) return;
      // 文档序下，已采集节点的后代必然紧随其后出现，跳过避免重叠
      if (lastCollected && lastCollected.contains(node)) return;
      collect(node);
      lastCollected = node;
    });
    return;
  }

  const stack: Element[] = [rootEl];
  while (stack.length) {
    const node = stack.pop() as Element;
    if (node.matches?.(ignoreSelector)) continue;

    const text = hasText(node);

    // 无直接文本且仅一个元素子节点 → 下钻穿透包装层
    if (!text && node.children.length === 1) {
      stack.push(node.children[0]);
      continue;
    }

    const children = Array.from(node.children);
    const block = children.some(isBlock);

    if (text || !block) {
      // 改造点：命中即采集，不再下钻子树，输出非重叠的有序段落
      collect(node);
      continue;
    }

    // 无直接文本且含块级子元素 → 逆序压栈（保持文档序）继续拆分
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
}
