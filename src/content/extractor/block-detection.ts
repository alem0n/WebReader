/**
 * 块级 / 文本判定（移植自 Translator.isBlockNode / hasTextNode）。
 *
 * 判定结果决定采集遍历是否需要继续向下拆分，是「命中即采集」策略的基础。
 */

/** 块级标签：决定遍历是否需要继续向下拆分 */
const TAGS_BLOCK = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'CANVAS',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'NOSCRIPT',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TFOOT',
  'UL',
  'VIDEO',
]);

/** 行内标签：直接判定为非块级，避免昂贵的 getComputedStyle */
const TAGS_INLINE = new Set([
  'ABBR',
  'ACRONYM',
  'B',
  'BDO',
  'BIG',
  'BR',
  'BUTTON',
  'CITE',
  'CODE',
  'DFN',
  'DEL',
  'FONT',
  'EM',
  'I',
  'IMG',
  'INPUT',
  'INS',
  'KBD',
  'LABEL',
  'MAP',
  'MARK',
  'OBJECT',
  'OUTPUT',
  'Q',
  'RUBY',
  'SAMP',
  'SCRIPT',
  'SELECT',
  'SMALL',
  'STRONG',
  'SUB',
  'SUP',
  'TEXTAREA',
  'TIME',
  'TT',
  'U',
  'VAR',
]);

const displayCache = new WeakMap<Element, boolean>();

/** 元素是否为块级（显式 display 属性 → 标签白名单 → computed display，WeakMap 缓存防回流） */
export function isBlockNode(el: unknown): boolean {
  if (!(el instanceof Element)) return false;

  // 显式 display 属性优先（部分框架/手写 HTML 直接写 display 属性）
  const displayAttr = el.getAttribute('display');
  if (displayAttr?.includes('inline')) return false;
  if (displayAttr?.includes('block')) return true;

  const name = el.nodeName?.toUpperCase();
  if (name && TAGS_INLINE.has(name)) return false;
  if (name && TAGS_BLOCK.has(name)) return true;

  const cached = displayCache.get(el);
  if (cached !== undefined) return cached;

  // 降级：computed style。采集全程不修改 DOM，布局只算一次并被浏览器缓存。
  let isBlock = true;
  try {
    const display = window.getComputedStyle(el).display;
    isBlock = !display.startsWith('inline');
  } catch {
    // getComputedStyle 不可用时按块级处理（大多数正文元素都是块级）
  }
  displayCache.set(el, isBlock);
  return isBlock;
}

/** 节点是否直接包含非空文本节点 */
export function hasTextNode(el: unknown): boolean {
  if (!(el instanceof Element) && !(el instanceof DocumentFragment)) {
    return false;
  }
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && /\S/.test(child.nodeValue || '')) {
      return true;
    }
  }
  return false;
}

export function matchesBlockSelector(node: Element, selector: string): boolean {
  if (!selector.trim()) return false;
  try {
    return node.matches(selector);
  } catch {
    // 非法选择器：静默忽略，回退到标签/显示判定
    return false;
  }
}
