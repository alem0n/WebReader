/**
 * reading-overlay.ts —— 网页内逐句高亮的 DOM 覆盖层
 *
 * 设计目标（与旧 inline-display 的根本区别）：**绝不覆盖或替换原文**。原文的每个
 * 字符都留在 DOM 原位，本层只把「正在朗读的句子」对应的文本节点包进透明 span，
 * 播放到该句时给它加高亮底色，播完移除高亮。原文内容、结构、样式全部不受影响。
 *
 * 数据结构：sentence-map 为每句话算出在单元「可寻址文本」中的精确字符区间
 * （剔除括号内容后可能多段）。本层据此拆分文本节点并包裹，建立双向映射：
 *   - 句子下标 → span 列表（供高亮定位，一句可能跨多个行内元素边界）
 *   - span → 句子下标（data-tts-sentence 属性，供未来「点击文字跳转朗读」直接读取）
 *
 * 生命周期：播放开始时 prepare（一次包裹全页），逐句 highlight 切换高亮类，
 * 停止/清空/关闭开关时 clear 拆除全部 span 并 normalize 还原文本节点。
 */
import { collectAddressableNodes, type TextUnit } from './extractor';
import { rebuildUnitSentenceRanges, type CharRange, type SentenceMap } from './sentence-map';
import { state } from './state';
import { READING_CLASS, injectReadingStyles } from './reading-styles';
import { createContentLogger } from './log';

const logger = createContentLogger('reading-overlay');

const SPAN_SELECTOR = `span.${READING_CLASS.sentence}`;

/** 某句子与其全部高亮 span 的映射（一句可能因跨行内元素边界而有多段 span） */
interface SentenceLocator {
  index: number;
  spans: HTMLElement[];
}

/** 一个单元待包裹的句子：全局下标 + 期望文本 + 建表时的区间 */
interface SentenceEntry {
  index: number;
  text: string;
  ranges: CharRange[];
}

/** 句子下标 → 该句的 span 列表（播放期间稳定，不随页面滚动变化） */
let locators: SentenceLocator[] = [];
/** 快速按句子下标取 span 列表（稀疏：单元失联的句子没有 span） */
let spansOfSentence: Array<HTMLElement[] | null> = [];
/** 当前正在高亮的句子下标（-1 = 无） */
let activeIndex = -1;
/** 本次 prepare 中「DOM 已变化但句子内容不变、成功重建区间」的单元数（日志/诊断用） */
let staleRecovered = 0;

/** span 元素（供未来点击跳转读取，当前未接入交互） */
function makeReadingSpan(sentenceIndex: number): HTMLElement {
  const span = document.createElement('span');
  span.className = READING_CLASS.sentence;
  span.dataset.ttsSentence = String(sentenceIndex);
  span.setAttribute('translate', 'no');
  return span;
}

/**
 * 把文本节点中 [a, b) 的字符独立成一个文本节点并返回（供包裹）。
 *
 * 从右边界开始拆分，保证左侧偏移量在拆分过程中不变；调用方按 a 降序处理多个区间。
 */
function isolateTextNode(node: Text, a: number, b: number): Text | null {
  if (!node.parentNode) return null;
  if (b < node.length) node.splitText(b); // 先切右边界：node 保留 [0, b)
  if (a > 0) return node.splitText(a); // 再切左边界：返回 [a, b)
  return node; // a === 0：node 本身就是 [0, b)
}

/** 单元内「句子区间 → 文本节点相交」的分组计算 */
interface NodeHit {
  index: number; // 句子下标
  a: number; // 相交区间在节点内的局部起点
  b: number; // 相交区间在节点内的局部终点
}

/**
 * 为一个段落单元包裹它的全部句子区间。
 *
 * 重新收集文本节点并校验「可寻址文本」与映射建立时是否一致：
 * - 完全一致 → 直接用建表区间包裹；
 * - 不一致但句子内容逐句相同（仅位置/空白漂移，常见于 SPA 重渲染/懒加载）→
 *   用新文本重建区间后照常包裹，救回「能取到正文却无高亮」的单元；
 * - 句子内容本身改变 → 跳过本单元，避免把 span 包到错位的内容上。
 */
function wrapUnitSentences(unit: TextUnit, sentences: SentenceEntry[]): SentenceLocator[] {
  const element = unit.element as HTMLElement;
  if (!element.isConnected) return [];

  const nodes = collectAddressableNodes(element);
  const addr = nodes.map((n) => n.nodeValue || '').join('');

  let effective = sentences;
  if (addr !== unit.text) {
    const rebuilt = rebuildUnitSentenceRanges(
      addr,
      sentences.map((s) => ({ index: s.index, text: s.text })),
      state.removeParentheticals
    );
    if (!rebuilt) return []; // 句子内容已变：放弃本单元
    // rebuilt 与 sentences 逐句顺序一致，沿用期望文本
    effective = rebuilt.map((r, i) => ({ ...r, text: sentences[i].text }));
    staleRecovered++;
  }

  // 展开为 (句子下标, 区间) 并按起点排序。同一句若被括号内容隔成多段保留区间
  // （如「你好（世界）再见」），合并为一个连续区间再包裹：高亮不断裂，也不把
  // 括号内容隔开在两段高亮之间——括号内容仍在 span 内、随本句一起被高亮底色覆盖，
  // 但不参与朗读（朗读文本由句子层另行剔除，见 sentence-map.splitUnitSentences）。
  const flat: Array<{ index: number; start: number; end: number }> = [];
  for (const s of effective) {
    if (!s.ranges.length) continue;
    let start = s.ranges[0].start;
    let end = s.ranges[0].end;
    for (const r of s.ranges) {
      if (r.start < start) start = r.start;
      if (r.end > end) end = r.end;
    }
    flat.push({ index: s.index, start, end });
  }
  flat.sort((x, y) => x.start - y.start);

  // 计算每个文本节点与哪些区间相交（区间跨节点边界时各节点各取一段）
  const perNode: Array<{ node: Text; hits: NodeHit[] }> = [];
  let globalStart = 0;
  let fi = 0;
  for (const node of nodes) {
    const gStart = globalStart;
    const gEnd = globalStart + node.length;
    const hits: NodeHit[] = [];

    while (fi < flat.length && flat[fi].end <= gStart) fi++; // 跳过已过去的区间
    let k = fi;
    while (k < flat.length && flat[k].start < gEnd) {
      const f = flat[k];
      const a = Math.max(0, f.start - gStart);
      const b = Math.min(node.length, f.end - gStart);
      if (b > a) hits.push({ index: f.index, a, b });
      k++;
      if (f.end > gEnd) break; // 区间延续到后续节点，本节点处理完毕
    }
    if (hits.length) perNode.push({ node, hits });
    globalStart = gEnd;
  }

  // 逐节点从右到左拆分并包裹（右侧先处理，保证左侧偏移不变）
  const bySentence = new Map<number, HTMLElement[]>();
  for (const { node, hits } of perNode) {
    hits.sort((x, y) => y.a - x.a);
    for (const hit of hits) {
      try {
        const isolated = isolateTextNode(node, hit.a, hit.b);
        if (!isolated || !isolated.parentNode) continue;
        const parent = isolated.parentNode;
        const span = makeReadingSpan(hit.index);
        parent.insertBefore(span, isolated);
        span.appendChild(isolated);
        const list = bySentence.get(hit.index);
        if (list) list.push(span);
        else bySentence.set(hit.index, [span]);
      } catch {
        // 拆分失败（节点被并发移除等）：跳过该段，不影响其余
      }
    }
  }

  const out: SentenceLocator[] = [];
  for (const [index, spans] of bySentence) out.push({ index, spans });
  return out;
}

/**
 * 准备高亮覆盖层：为整页每个句子区间包裹透明 span，建立句子↔span 映射。
 *
 * 幂等：先 clear 再重建。主开关关闭、无句子映射（选中朗读/粘贴等）时不应调用。
 */
export function prepareReadingOverlay(units: TextUnit[], map: SentenceMap): void {
  clearReadingOverlay();
  injectReadingStyles();

  if (!map.sentences.length) return;

  // 按单元分组，每个单元只收集并校验一次文本节点
  const byUnit: Array<SentenceEntry[]> = [];
  for (let i = 0; i < map.sentences.length; i++) {
    const ui = map.ownerIndex[i];
    if (ui < 0 || ui >= units.length) continue;
    const group = byUnit[ui] || (byUnit[ui] = []);
    group.push({ index: i, text: map.sentences[i], ranges: map.ranges[i] });
  }

  staleRecovered = 0;
  spansOfSentence = new Array(map.sentences.length).fill(null);
  for (let ui = 0; ui < byUnit.length; ui++) {
    const group = byUnit[ui];
    if (!group || !group.length) continue;
    for (const loc of wrapUnitSentences(units[ui], group)) {
      locators.push(loc);
      spansOfSentence[loc.index] = loc.spans;
    }
  }
  if (staleRecovered > 0) {
    logger.debug(`${staleRecovered} 个单元的 DOM 已变化，已按最新文本重建高亮区间`);
  }
}

/** 移除当前高亮（不拆除 span） */
function clearActiveHighlight(): void {
  if (activeIndex < 0) return;
  const spans = spansOfSentence[activeIndex];
  if (spans) for (const span of spans) span.classList.remove(READING_CLASS.active);
  activeIndex = -1;
}

/**
 * 高亮第 index 句（朗读进度的网页内同步）。
 *
 * 覆盖层未准备、或该句无 span（单元失联/整句在括号内）时静默跳过；此时悬浮窗
 * 文本框仍是唯一的高亮展示，不会出现「没有任何高亮」的空档。
 */
export function highlightSentence(index: number): void {
  if (index === activeIndex) return;
  clearActiveHighlight();
  activeIndex = index;

  const spans = spansOfSentence[index];
  if (!spans || !spans.length) return;
  for (const span of spans) span.classList.add(READING_CLASS.active);
  scrollActiveIntoView(spans);
}

/** 仅当高亮句离开视口「舒适带」时才滚动，避免与用户手动滚动打架 */
function scrollActiveIntoView(spans: HTMLElement[]): void {
  // 关闭「朗读时自动滚动页面」时只高亮不滚动，浏览器滚动条保持原位
  if (!state.autoScrollEnabled) return;
  const first = spans[0];
  if (!first || !first.isConnected) return;
  try {
    const rect = first.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!vh) return;
    const bandTop = vh * 0.3;
    const bandBottom = vh * 0.7;
    if (rect.top < bandTop || rect.bottom > bandBottom) {
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  } catch {
    // 布局不可用时跳过滚动
  }
}

/**
 * 全量清理：拆除全部句子 span，把文本节点还回原位并 normalize 合并。
 *
 * 调用后页面与包裹前逐字一致（文本内容、顺序完全不变），供停止/清空/
 * 关闭开关/页面卸载使用，保证页面无残留、无结构破坏。
 */
export function clearReadingOverlay(): void {
  clearActiveHighlight();

  const touched = new Set<Element>();
  try {
    document.querySelectorAll(SPAN_SELECTOR).forEach((node) => {
      const span = node as HTMLElement;
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span); // 文本节点还回原位
      parent.removeChild(span);
      touched.add(parent as Element);
    });
  } catch {
    // 兜底清理失败不阻塞主流程
  }

  locators = [];
  spansOfSentence = [];
  // 合并被拆散的相邻文本节点，恢复原始 DOM 结构
  for (const el of touched) {
    try {
      el.normalize();
    } catch {
      // ignore
    }
  }
}

/**
 * 由 DOM 节点反查句子下标（data-tts-sentence）。
 *
 * 「点击网页文字跳转到对应位置朗读」的查询入口：在 document 上委托监听点击，
 * 用本函数读出句子下标，再交给播放器跳转。
 */
export function findSentenceIndexFromNode(node: Node | null): number | null {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  const span = el?.closest(SPAN_SELECTOR) as HTMLElement | null;
  if (!span) return null;
  const raw = span.dataset.ttsSentence;
  if (raw === undefined || raw === null) return null;
  const idx = Number(raw);
  return Number.isFinite(idx) ? idx : null;
}

/** mousedown 时记录的坐标（供 click 时判定是否为拖选） */
interface PointerDownPos {
  x: number;
  y: number;
}

/** 不应触发跳转的页面交互元素（放行其默认行为） */
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, [contenteditable="true"]';

/** 拖选阈值：mousedown→click 位移超过该距离视为选择文字，不触发跳转 */
const DRAG_THRESHOLD_PX = 6;

/**
 * 判定一次点击是否应触发「跳到该句朗读」，返回目标句子下标或 null。
 *
 * 全部排除规则集中在此纯函数，便于单测：
 *   - 修饰键（Ctrl/Cmd/Alt）点击 → 放行，让浏览器与用户自定义生效
 *   - 拖选文字（位移超过阈值）→ 放行，用户在选择文字（划词朗读）
 *   - 点击 span 内的链接/按钮/输入/可编辑元素 → 放行，不劫持页面交互
 *   - 点击目标不在任何句子 span 内 → null（普通文字，无映射）
 *   - 下标越界（SPA 改动后 span 属于旧 map）→ null
 */
export function resolveClickJumpTarget(e: MouseEvent, map: SentenceMap | null, pointerDown: PointerDownPos | null): number | null {
  if (!map || !map.sentences.length) return null;

  // 修饰键点击：放行（新窗口打开链接、用户自定义手势等）
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  // 拖选判定：位移超过阈值视为选择文字
  if (pointerDown) {
    const dx = e.clientX - pointerDown.x;
    const dy = e.clientY - pointerDown.y;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return null;
  }

  const target = e.target;
  // 文本节点点击（某些环境/模拟场景）归一化到其父元素
  const el = target instanceof Element ? target : ((target as Node | null)?.parentElement ?? null);
  if (!el) return null;

  // 点击 span 内的交互元素：放行默认行为
  if (el.closest(INTERACTIVE_SELECTOR)) return null;

  const idx = findSentenceIndexFromNode(el);
  if (idx === null) return null;

  // 越界保护（SPA 路由切换等可能使 span 属于已失效的旧 map）
  if (idx < 0 || idx >= map.sentences.length) return null;

  return idx;
}
