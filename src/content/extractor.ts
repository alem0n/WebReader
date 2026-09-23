/**
 * extractor.ts — 网页正文采集器
 *
 * 移植自 kiss-translator 的正文识别层（块级遍历 + 文本过滤 + 站点规则），
 * 改造为纯只读采集器：不注入 DOM、不修改页面，仅输出有序段落文本。
 *
 * 与 kiss 原始算法的两处刻意差异：
 * 1. 命中即采集、不再下钻子树，避免文本重叠（翻译场景允许各自重复翻译，
 *    朗读场景重叠文本会导致重复朗读）。
 * 2. 不做 maxLength 上限过滤（长段落本身就是正文，不能丢），仅过滤短噪声
 *    与 URL/数字等。超长切分交给下游 SentencePlayer.capLongSentences 兜底。
 *
 * 输出约定：段落之间用 "\n\n" 连接——SentencePlayer.setText 只按 /\n\n+/
 * 识别段落边界（决定播放停顿与展示换行）。
 */

// ---------------------------------------------------------------------------
// 标签分类（移植自 kiss-translator translator.js 的 Translator.TAGS）
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 选择器（移植自 kiss-translator config/rules.js）
// ---------------------------------------------------------------------------

/** 显式模式下的默认正文元素选择器 */
export const DEFAULT_SELECTOR = 'h1, h2, h3, h4, h5, h6, li, p, dd, blockquote, figcaption, label, legend';

/** 默认忽略：按钮、页脚、代码块、导航、矢量图、Logo */
export const DEFAULT_IGNORE_SELECTOR = "button, footer, pre, mark, nav, svg, img[src*='.svg'], [class*='logo'] svg, [id*='logo'] svg";

/**
 * 内置忽略：不可朗读或无意义的元素（autoScan 智能扫描模式下生效）。
 *
 * 相对 kiss 的增强：TTS 只读正文，页面外壳（nav/header/footer/aside）即使不含
 * 「正文」也一律排除。这些角色在现代页面里几乎只承载导航/工具栏/页脚，
 * 遍历的栈剪枝会跳过命中节点的整个子树，因此无需 closest 逐节点回溯。
 * 已知取舍：文章内 <header> 中的标题会被一并排除（与旧版 collectPageText 行为一致）。
 */
const BUILTIN_IGNORE_SELECTOR = `address, area, audio, br, canvas,
data, datalist, embed, head, iframe, input, noscript, map,
object, option, param, picture, progress,
select, script, style, svg, track, textarea, template,
video, wbr, .notranslate, [contenteditable='true'], [translate='no'],
nav, header, footer, aside`;

/** 本扩展自身注入页面的 DOM，绝不参与采集 */
const SELF_IGNORE_SELECTOR =
  '#tts-widget-host, #tts-selection-button-host, #tts-context-invalidated-toast, ' +
  // 网页内逐句高亮注入的句子 span，防止重新采集时把已包裹的文本当正文重复朗读
  'span.tts-reading-sentence';

// ---------------------------------------------------------------------------
// 文本噪声过滤（移植自 kiss-translator 的 BUILTIN_SKIP_PATTERNS）
// ---------------------------------------------------------------------------

const BUILTIN_SKIP_PATTERNS: RegExp[] = [
  // 1. URL (http, https, ftp, file, www)
  /^(?:(?:https?|ftp|file):\/\/|www\.)[^\s/$.?#].[^\s]*$/i,
  // 2. 邮箱
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  // 3. 文件路径 (Unix / Windows)
  /^(?:[a-zA-Z]:\\|\/|\\)(?:[\w\-. ]+\/|[\w\-. ]+\\)*[\w\-. ]*\.?[\w\-. ]*$/,
  // 4. UUID
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  // 5. 纯数字（含千分位、小数、货币符号与单位）
  /^[$\u00A2-\u00A5\u20A0-\u20CF]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s?(?:px|%|em|rem|pt|vw|vh|deg|s|ms)?$/,
  // 6. 版本号 (v1.2.3, 10.0.1)
  /^v?\d+(\.\d+){1,3}$/,
  // 7. ISO 8601 日期/时间
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
  // 8. 模板占位符 ({{var}}, ${var}, __VAR__, %s)
  /^({{[^}]+}}|\${[^}]+}|__\w+__|%\w+)$/,
  // 9. CSS 选择器 / 十六进制颜色
  /^(?:\.|#)[\w-]+$|^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  // 10. 用户名 (@username)
  /^@[\w.-]+$/,
  // 11. HTML 实体
  /^&\w+;$/,
  // 12. 中括号序号 ([1], [99])
  /^\[\d+\]$/,
  // 13. 简单时间 (12:30, 9:45:30)
  /^\d{1,2}:\d{2}(:\d{2})?$/,
  // 14. 常见扩展名文件名 (document.pdf)
  /^[^\s\\/:]+?\.[a-zA-Z0-9]{2,5}$/,
];

/** 触发采集的最小文本字符数（过短字符如单个字母不予采集） */
const MIN_TEXT_LENGTH = 2;

// ---------------------------------------------------------------------------
// 站点规则（移植自 kiss-translator config/rules.js 的 RULES_MAP，
// 仅保留与正文采集相关的字段：autoScan / selector / ignoreSelector /
// blockSelector / rootsSelector）
// ---------------------------------------------------------------------------

interface ExtractRule {
  /** 是否启用智能扫描（"true" 启用裸文本遍历，"false" 仅用 selector） */
  autoScan: string;
  /** 显式模式下的正文元素选择器 */
  selector: string;
  /** 额外忽略选择器 */
  ignoreSelector: string;
  /** 自定义块级元素选择器 */
  blockSelector: string;
  /** 限制扫描仅在特定根容器内进行 */
  rootsSelector: string;
}

const DEFAULT_RULE: ExtractRule = {
  autoScan: 'true',
  selector: DEFAULT_SELECTOR,
  ignoreSelector: DEFAULT_IGNORE_SELECTOR,
  blockSelector: '',
  rootsSelector: 'body',
};

interface SiteRule {
  /** 匹配网址的通配符模式（逗号/换行分隔表示或） */
  pattern: string;
  rule: Partial<ExtractRule>;
}

/** 顺序敏感：更具体的模式（如 live_chat）必须排在通用模式（如 youtube.com）之前 */
const SITE_RULES: SiteRule[] = [
  {
    // 限定到正文容器 #mw-content-text：标题栏/语言按钮/粘性工具栏/分类列表
    // 均在该容器之外，从根上排除，无需逐一枚举噪声选择器。
    pattern: '.wikipedia.org',
    rule: {
      rootsSelector: '#mw-content-text',
      ignoreSelector: `.button, code, footer, form, mark, pre, .mwe-math-element, .mw-editsection, .sidebar, .navbox`,
    },
  },
  {
    pattern: 'news.ycombinator.com',
    rule: {
      selector: `p, .titleline, .commtext, .hn-item-title, .hn-comment-text, .hn-story-title`,
      ignoreSelector: `button, code, footer, form, header, mark, nav, pre, .reply`,
      autoScan: 'false',
    },
  },
  {
    pattern: 'twitter.com, https://x.com',
    rule: {
      selector: `[data-testid='tweetText'], [data-testid='twitter-article-title'], [data-testid='UserDescription'], .public-DraftStyleDefault-block, span.text-body, div.css-175oi2r.r-3pj75a div.css-175oi2r>span, div.css-175oi2r.r-3pj75a li>span, div.r-1s2bzr4>div.r-16dba41, div.r-16y2uox>div.r-1jeg54m`,
      ignoreSelector: `[data-testid='videoPlayer'], [data-testid^='tweetTextarea']`,
      autoScan: 'false',
    },
  },
  {
    pattern: 'www.youtube.com/live_chat',
    rule: {
      rootsSelector: `div#items`,
      selector: `span.yt-live-chat-text-message-renderer`,
      autoScan: 'false',
    },
  },
  {
    pattern: 'www.youtube.com',
    rule: {
      rootsSelector: `ytd-page-manager`,
      ignoreSelector: `aside, button, footer, form, header, pre, mark, nav, #player, #container, .caption-window, .ytp-settings-menu`,
    },
  },
  {
    pattern: 'web.telegram.org',
    rule: {
      autoScan: 'false',
      selector: '.text-content, .embedded-text-wrapper',
      rootsSelector: '.Transition',
    },
  },
  {
    pattern: 'github.com',
    rule: {
      autoScan: 'false',
      selector: `h1, h2, h3, h4, h5, h6, .markdown-body li, p, dd, blockquote, figcaption, label, legend, .user-profile-bio>div, [data-testid="results-list"] .search-match, .Subhead-description, [class^="prc-SelectPanel-Subtitle-"], [class^="prc-ActionList-ItemLabel-"], [role="dialog"] .overflow-auto, .h4, .repos-list-description, .discussion-title, [class*="PinnedIssue-module__Link"] span, .js-wiki-sidebar-page-container :is(.Truncate-text, .Link--primary)`,
      ignoreSelector: `button, p.pinned-item-desc+p`,
    },
  },
];

// ---------------------------------------------------------------------------
// 通配符匹配（移植自 kiss-translator libs/utils.js 的 isMatch）
// ---------------------------------------------------------------------------

function isAllChar(s: string, ch: string, start: number): boolean {
  for (let i = start; i < s.length; i++) {
    if (s[i] !== ch) return false;
  }
  return true;
}

/** 支持 * 通配符的字符串匹配（pattern 隐含首尾通配） */
export function isMatch(s: string, p: string): boolean {
  if (s.length === 0 || p.length === 0) return false;

  p = '*' + p + '*';

  let sIndex = 0;
  let pIndex = 0;
  let sRecord = -1;
  let pRecord = -1;

  while (sIndex < s.length && pRecord < p.length) {
    if (p[pIndex] === '*') {
      pIndex++;
      sRecord = sIndex;
      pRecord = pIndex;
    } else if (s[sIndex] === p[pIndex]) {
      sIndex++;
      pIndex++;
    } else if (sRecord + 1 < s.length) {
      sRecord++;
      sIndex = sRecord;
      pIndex = pRecord;
    } else {
      return false;
    }
  }

  if (p.length === pIndex) return true;
  return isAllChar(p, '*', pIndex);
}

/** 逗号/换行分隔的多模式按 URL 匹配（移植自 matchesRulePattern） */
export function matchesRulePattern(href: string, pattern: string): boolean {
  return pattern.split(/\n|,/).some((token) => {
    const p = token.trim();
    return p.length > 0 && isMatch(href, p);
  });
}

// ---------------------------------------------------------------------------
// 块级 / 文本判定（移植自 Translator.isBlockNode / hasTextNode）
// ---------------------------------------------------------------------------

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

function matchesBlockSelector(node: Element, selector: string): boolean {
  if (!selector.trim()) return false;
  try {
    return node.matches(selector);
  } catch {
    // 非法选择器：静默忽略，回退到标签/显示判定
    return false;
  }
}

// ---------------------------------------------------------------------------
// 文本有效性过滤（移植自 #isInvalidText，去掉 maxLength 上限）
// ---------------------------------------------------------------------------

const combinedSkipsRegex = new RegExp(BUILTIN_SKIP_PATTERNS.map((r) => `(${r.source})`).join('|'));

/** 文本是否值得朗读：非空、够长、非纯数字、非 URL/版本号等噪声 */
export function isValidText(text: string): boolean {
  if (typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length < MIN_TEXT_LENGTH) return false;

  // 单个非字母字符
  if (trimmed.length === 1 && !/[a-zA-Z]/.test(trimmed)) return false;

  // 纯数字（整串可解析为有限数字才排除，"3.14美元" 之类保留）
  if (!isNaN(parseFloat(trimmed)) && Number.isFinite(Number(trimmed))) {
    return false;
  }

  if (combinedSkipsRegex.test(trimmed)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// 可寻址文本节点（句子↔DOM 精确对齐的基础）
// ---------------------------------------------------------------------------

/** 收集可寻址文本节点时跳过的元素：不可朗读/无意义/本扩展自身注入的节点 */
const ADDRESSABLE_IGNORE_SELECTOR =
  'script, style, noscript, template, select, textarea, button, option, ' + 'span.tts-reading-sentence, [contenteditable="true"]';

/**
 * 收集元素内的「可寻址文本节点」：文档序、跳过隐藏子树与不可朗读元素。
 *
 * 这些节点的 nodeValue 按序拼接即 TextUnit.text，句子映射层据此把每句话映射到
 * **精确的字符区间**，网页内逐句高亮按区间回指 DOM（见 reading-overlay.ts）。
 * 因此本函数与 reading-overlay 的拆包/还原逻辑共用同一份「文本 = 节点拼接」约定，
 * 任何调整都要同步两边。
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
function isVisibleUnit(unit: Element): boolean {
  try {
    const opacity = window.getComputedStyle(unit).opacity;
    if (opacity === '0') return false;
  } catch {
    // computed style 不可用时按可见处理
  }
  return true;
}

// ---------------------------------------------------------------------------
// 核心遍历（移植自 translationTargets.js 的 visitTranslationTargets，
// 增加关键改造：命中即采集、不下钻子树）
// ---------------------------------------------------------------------------

interface CollectOptions {
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
 */
function collectTargets(root: Node, options: CollectOptions, collect: (el: Element) => void): void {
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

// ---------------------------------------------------------------------------
// 规则解析与对外入口
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  rootsSelector?: string;
  selector?: string;
  ignoreSelector?: string;
  blockSelector?: string;
  autoScan?: string;
}

/**
 * 正文「段落单元」：元素引用 + 与 DOM 逐字对齐的可寻址文本。
 *
 * text 由 collectAddressableNodes(element) 的文本节点按文档序拼接而成（未 trim），
 * 与 DOM 一一对应：句子映射层据此把每句话映射到精确字符区间，网页内逐句高亮
 * （reading-overlay.ts）按区间把对应文本节点包进可高亮 span，原文位置不变。
 */
export interface TextUnit {
  element: Element;
  text: string;
}

function resolveRule(href: string, options?: ExtractOptions): ExtractRule {
  const site = SITE_RULES.find((r) => matchesRulePattern(href, r.pattern));
  const override = options ? Object.fromEntries(Object.entries(options).filter(([, v]) => v != null && String(v).trim() !== '')) : {};

  const rule: ExtractRule = { ...DEFAULT_RULE, ...(site?.rule || {}), ...override };

  // 站点规则的 ignoreSelector 只能「追加」不能「覆盖」：
  // 页面外壳忽略集（nav/header/footer/aside/button 等）必须始终生效，
  // 否则像维基百科这类站点规则会丢失关键排除项，导致导航/菜单被采集。
  const extraIgnore = site?.rule?.ignoreSelector?.trim();
  if (extraIgnore) {
    rule.ignoreSelector = [DEFAULT_RULE.ignoreSelector, extraIgnore].join(', ');
  }

  return rule;
}

/** 组装最终的忽略选择器：本扩展自身 DOM + （智能扫描模式下）内置忽略 + 规则忽略 */
function buildIgnoreSelector(rule: ExtractRule): string {
  const parts = [SELF_IGNORE_SELECTOR];
  if (rule.autoScan !== 'false') {
    parts.push(BUILTIN_IGNORE_SELECTOR);
  }
  const userSelector = rule.ignoreSelector?.trim();
  if (userSelector) parts.push(userSelector);
  return parts.join(', ');
}

/**
 * 采集当前页面的正文「段落单元」：元素引用 + 可寻址文本。
 *
 * 与 extractPageText 使用完全相同的遍历（collectTargets）与过滤，唯一区别是回调
 * 同时收下元素引用，供整页朗读建立「句子 → 段落单元 → 精确字符区间」映射，
 * 从而能把正在朗读的句子在网页原位高亮（见 sentence-map.ts / reading-overlay.ts）。
 *
 * @returns 文档序、非重叠的段落单元数组；无正文时为空。
 */
export function collectPageUnits(options?: ExtractOptions): TextUnit[] {
  let href = '';
  try {
    href = window.location.href;
  } catch {
    href = '';
  }

  const rule = resolveRule(href, options);
  const rootsSelector = rule.rootsSelector?.trim() || 'body';

  let roots: Element[] = [];
  try {
    roots = Array.from(document.querySelectorAll(rootsSelector));
  } catch {
    roots = [];
  }

  const ignoreSelector = buildIgnoreSelector(rule);
  const isBlock = (el: Element) => matchesBlockSelector(el, rule.blockSelector) || isBlockNode(el);

  const units: TextUnit[] = [];

  for (const root of roots) {
    collectTargets(
      root,
      {
        autoScan: rule.autoScan,
        selector: rule.selector,
        ignoreSelector,
        isBlock,
        hasText: hasTextNode,
      },
      (unit) => {
        if (!isVisibleUnit(unit)) return;
        const text = readAddressableText(unit);
        if (!isValidText(text)) return;
        units.push({ element: unit, text });
      }
    );
  }

  return units;
}

/**
 * 采集当前页面的正文文本。
 *
 * @returns 用 "\n\n" 连接的段落文本，可直接喂给 SentencePlayer.setText。
 *          无可用正文时返回空字符串。
 */
export function extractPageText(options?: ExtractOptions): string {
  return collectPageUnits(options)
    .map((unit) => unit.text.trim())
    .join('\n\n');
}
