/**
 * sentence-map.ts —— 「句子 → 页面段落单元 → 精确字符区间」映射层
 *
 * 整页朗读时，采集层（extractor.collectPageUnits）给出文档序、非重叠的段落单元
 * { element, text }，其中 text 是「可寻址文本」——元素内可见文本节点按文档序拼接，
 * 与 DOM 逐字对齐。本层把每个单元切成**互不重叠、恰好覆盖原文**的句子区间：
 *
 *   unit.text = 句子区间拼接（含被括号过滤跳过的字符）
 *
 * 因此「第 i 句」既能唯一对应 units[ ownerIndex[i] ] 这个页面元素，又能对应到该元素
 * 内的一组字符区间。reading-overlay.ts 据此把对应文本节点包进可高亮 span —— 原文
 * 原封不动留在原位，只高亮正在朗读的那一句（不覆盖、不替换原文）。
 *
 * 为什么不复用 SentencePlayer 的切分？splitIntoSentences 会做字符串替换式保护
 * （把 '.' 换成 <DOT> 等占位符），输出句子与原文不再是逐字对齐的分区，无法稳定回指
 * DOM。这里改用等价的**区间式**实现（缩写/小数保护 + 断句 + 小写续句合并 + 长句拆分），
 * 切出来的区间在地址空间上严格分区，是天生的「句子 ↔ 位置」数据结构。
 *
 * 同一份数据结构也直接支持未来的「点击网页文字跳转到对应位置朗读」：每个 span 带
 * data-tts-sentence 句子下标（见 reading-overlay.findSentenceIndexFromNode）。
 */
import { collectPageUnits, type ExtractOptions, type TextUnit } from './extractor';
import { state } from './state';
import { getParentheticalRemovedRanges, subtractCharRanges, type CharRange } from '../shared/parentheticals';

export type { CharRange } from '../shared/parentheticals';

export interface SentenceMap {
  /** 实际播放的句子表（区间内文本去空白后） */
  sentences: string[];
  /** sentences[i] 属于 units[ ownerIndex[i] ]；与 sentences 等长 */
  ownerIndex: number[];
  /**
   * sentences[i] 在所属单元可寻址文本中的**保留字符区间**（剔除括号内容后，可能多段）。
   * 区间在 unit.text 地址空间内互不重叠，union 覆盖所有「会被朗读」的字符；
   * 括号内的字符不属于任何区间，因此不参与朗读，但仍留在网页原位——高亮层
   * （reading-overlay）会把同一句的多段区间合并为一个连续区间包裹，使括号内容
   * 随本句一起被高亮覆盖、视觉上不被隔开。
   */
  ranges: CharRange[][];
  /** 段落停顿位置，语义同 SentencePlayer.paragraphBreakAfterIndex */
  paragraphBreakAfterIndex: Set<number>;
}

/**
 * 采集整页正文并构建句子映射。
 *
 * @returns 单元数组与对应的句子映射；无正文时两者均为空结构。
 */
export function collectPageForReading(options?: ExtractOptions): { units: TextUnit[]; map: SentenceMap } {
  const units = collectPageUnits(options);
  return { units, map: buildSentenceMap(units) };
}

/**
 * 由段落单元构建句子映射：把每个单元的可寻址文本切成区间式句子，并剔除括号内容。
 */
export function buildSentenceMap(units: TextUnit[]): SentenceMap {
  const sentences: string[] = [];
  const ownerIndex: number[] = [];
  const ranges: CharRange[][] = [];
  const paragraphBreakAfterIndex = new Set<number>();

  for (let ui = 0; ui < units.length; ui++) {
    const startLen = sentences.length;
    for (const s of splitUnitSentences(units[ui].text, state.removeParentheticals)) {
      sentences.push(s.text);
      ownerIndex.push(ui);
      ranges.push(s.ranges);
    }

    if (sentences.length > startLen && ui < units.length - 1) {
      paragraphBreakAfterIndex.add(sentences.length - 1);
    }
  }

  return { sentences, ownerIndex, ranges, paragraphBreakAfterIndex };
}

/** 一个单元切出的「句子内容 + 保留区间」 */
interface UnitSentence {
  text: string;
  ranges: CharRange[];
}

/**
 * 句子文本归一化（仅用于失联重建时的一致性比对，不改变实际朗读内容）。
 *
 * 忽略全部空白：高亮覆盖的是整段合并区间、朗读用的是建表时的句子表，
 * 纯空白差异（页面重排引入的空格 / 换行 / 缩进）既不影响高亮位置也不影响朗读内容，
 * 应当容错恢复，而不是因此放弃整单元高亮。
 */
function normalizeSentenceText(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * 把一个单元的可寻址文本切成句子并剔除括号内容（区间式，与 DOM 逐字对齐）。
 *
 * 建表（buildSentenceMap）与失联单元重建（rebuildUnitSentenceRanges）共用同一份
 * 切分逻辑，保证「同一段地址文本」在任何时候切出的句子都逐字一致。
 */
function splitUnitSentences(addr: string, removeParentheticals: boolean): UnitSentence[] {
  // 括号过滤改为「区间级」：只标记被移除的字符位置，原文与 DOM 对齐不被破坏
  const removed = removeParentheticals ? getParentheticalRemovedRanges(addr) : [];

  const out: UnitSentence[] = [];
  for (const seg of segmentSentences(addr)) {
    const kept = subtractCharRanges(seg.start, seg.end, removed);
    if (!kept.length) continue; // 整句都在括号内：不朗读、不高亮
    const text = kept
      .map((k) => addr.slice(k.start, k.end))
      .join('')
      .replace(/[ \t]{2,}/g, ' ') // 与 stripParentheticals 的空白压缩一致
      .trim();
    if (!text) continue;
    out.push({ text, ranges: kept });
  }
  return out;
}

/**
 * 在（可能已被页面改动的）新地址文本上，为指定句子重建字符区间。
 *
 * 采集（按钮点击时）与包裹（开始播放时）之间存在时间差，页面 DOM 可能重排 /
 * 重渲染 / 懒加载，使句子在原文中的绝对位置整体漂移。若新文本切分出的句子
 * 内容与期望句子**逐句一致**（仅位置 / 空白漂移），返回按期望顺序对齐的新区间；
 * 句子内容本身改变（增删句）时返回 null，调用方应放弃该单元。
 *
 * 这是「能获取正文但无法高亮部分正文」的关键兜底：位置漂移能救回，内容真变了
 * 才放弃，把失联造成的「整单元无高亮」降到最小。
 */
export function rebuildUnitSentenceRanges(
  newAddr: string,
  expected: Array<{ index: number; text: string }>,
  removeParentheticals: boolean
): Array<{ index: number; ranges: CharRange[] }> | null {
  const fresh = splitUnitSentences(newAddr, removeParentheticals);
  if (fresh.length !== expected.length) return null;

  const out: Array<{ index: number; ranges: CharRange[] }> = [];
  for (let i = 0; i < fresh.length; i++) {
    if (normalizeSentenceText(fresh[i].text) !== normalizeSentenceText(expected[i].text)) return null;
    out.push({ index: expected[i].index, ranges: fresh[i].ranges });
  }
  return out;
}

/**
 * 由规范句子表重建展示文本（与 SentencePlayer.getDisplayText 同一语义）。
 *
 * 用于整页路径填充悬浮窗文本框：文本框内容与规范句子表互为镜像，
 * 使 handlePlayPause 的「规范路径」自检（文本框文本 === 重建文本）成立。
 */
export function getDisplayTextFromMap(map: SentenceMap): string {
  const s = map.sentences;
  if (!s.length) return '';
  const parts: string[] = [];
  for (let i = 0; i < s.length; i++) {
    parts.push(s[i]);
    if (i < s.length - 1) {
      parts.push(map.paragraphBreakAfterIndex.has(i) ? '\n\n' : ' ');
    }
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// 区间式句子分割（语义对齐 SentencePlayer，但严格按地址空间分区）
// ---------------------------------------------------------------------------

const SENTENCE_END_CHARS = '.!?。！？…';
const CLAUSE_PUNCT_CHARS = ',;:、，；：';
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'ave',
  'blvd',
  'rd',
  'inc',
  'ltd',
  'co',
  'corp',
  'etc',
  'vs',
  'cf',
  'no',
  'vol',
  'pp',
  'ed',
  'eds',
  'al',
  'approx',
  'dept',
  'est',
  'gov',
  'org',
]);

function isSentenceEnd(ch: string): boolean {
  return SENTENCE_END_CHARS.indexOf(ch) >= 0;
}

function isClausePunct(ch: string): boolean {
  return CLAUSE_PUNCT_CHARS.indexOf(ch) >= 0;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u00a0';
}

function isLowerLetter(ch: string): boolean {
  // 对齐 SentencePlayer 的 /^\p{Ll}/：仅小写字母触发续句合并。
  // 中文等无大小写文字（\p{Lo}）不属于 \p{Ll}，因此中文句子不会互相合并。
  return /^\p{Ll}$/u.test(ch);
}

function isLetter(ch: string): boolean {
  return /[a-zA-Z]/.test(ch);
}

/** 标点 run 之前紧邻的字母词（用于缩写判定），非字母结尾时返回空串 */
function precedingWord(text: string, end: number): string {
  let i = end;
  while (i > 0 && isLetter(text[i - 1])) i--;
  return text.slice(i, end);
}

/** 该标点 run 之后是否可以断句（缩写 / 小数 / 单字母首字母不在此断） */
function canBreakAfter(text: string, runStart: number, runEnd: number): boolean {
  const before = runStart > 0 ? text[runStart - 1] : '';
  const after = runEnd < text.length ? text[runEnd] : '';

  // 数字 + 点 + 数字（小数 / 日期 / 版本号）：不断
  if (isDigit(before) && isDigit(after)) return false;

  const word = precedingWord(text, runStart);
  if (word) {
    // 已知缩写（Mr. / Dr. / etc.）：不断
    if (ABBREVIATIONS.has(word.toLowerCase())) return false;
    // 单字母大写缩写（J. Smith / U.S.）且后接空白：不断
    if (word.length === 1 && isLetter(word) && word === word.toUpperCase() && after === ' ') return false;
  }
  return true;
}

/**
 * 把文本切成互不重叠、顺序覆盖的句子区间（空白字符可不属于任何区间）。
 *
 * 断句规则对齐 SentencePlayer：句尾标点 run 后断句，但保护小数/日期/缩写/单字母
 * 首字母；随后把「以小写开头」的续句并入上一句；最后把超长句在子句标点处拆分。
 */
export function segmentSentences(text: string, maxLen = 280): CharRange[] {
  const n = text.length;
  const raw: CharRange[] = [];
  let sentStart = 0;
  let i = 0;

  while (i < n) {
    if (isSentenceEnd(text[i])) {
      let runEnd = i;
      while (runEnd < n && isSentenceEnd(text[runEnd])) runEnd++;
      if (canBreakAfter(text, i, runEnd)) {
        raw.push({ start: sentStart, end: runEnd });
        sentStart = runEnd;
      }
      i = runEnd;
      continue;
    }
    i++;
  }
  if (sentStart < n) raw.push({ start: sentStart, end: n });

  const merged = mergeLowercaseContinuations(raw, text);
  const capped = capLongRanges(merged, text, maxLen);

  // 去掉区间首尾空白，丢弃空区间；剩余空白留在 span 之外，仍在网页原位可见
  const out: CharRange[] = [];
  for (const r of capped) {
    let s = r.start;
    let e = r.end;
    while (s < e && isWhitespace(text[s])) s++;
    while (e > s && isWhitespace(text[e - 1])) e--;
    if (e > s) out.push({ start: s, end: e });
  }
  return out;
}

/** 把「以小写字母开头」的区间并入上一个区间（对齐 mergeLowercaseContinuationSentences） */
function mergeLowercaseContinuations(ranges: CharRange[], text: string): CharRange[] {
  const out: CharRange[] = [];
  for (const r of ranges) {
    let i = r.start;
    while (i < r.end && isWhitespace(text[i])) i++;
    const startsLower = i < r.end && isLowerLetter(text[i]);
    if (startsLower && out.length) {
      const prev = out[out.length - 1];
      if (prev.end > prev.start && isSentenceEnd(text[prev.end - 1])) {
        prev.end = r.end; // 并入上一句
        continue;
      }
    }
    out.push({ start: r.start, end: r.end });
  }
  return out;
}

/** 超长句在子句标点处拆分（对齐 capLongSentences），仍超长则按词边界硬切兜底 */
function capLongRanges(ranges: CharRange[], text: string, maxLen: number): CharRange[] {
  const out: CharRange[] = [];
  for (const r of ranges) {
    if (r.end - r.start <= maxLen) {
      out.push(r);
      continue;
    }
    // 按子句标点切成子段
    const sub: CharRange[] = [];
    let segStart = r.start;
    for (let i = r.start; i < r.end; i++) {
      if (isClausePunct(text[i])) {
        sub.push({ start: segStart, end: i + 1 });
        segStart = i + 1;
      }
    }
    if (segStart < r.end) sub.push({ start: segStart, end: r.end });
    if (sub.length < 2) {
      out.push(r); // 无子句标点：交给硬切兜底
      continue;
    }
    // 贪心合并子段，使每段尽量接近 maxLen
    const merged: CharRange[] = [];
    let curStart = sub[0].start;
    let curEnd = sub[0].end;
    for (let i = 1; i < sub.length; i++) {
      const s = sub[i];
      if (s.end - curStart > maxLen) {
        merged.push({ start: curStart, end: curEnd });
        curStart = s.start;
        curEnd = s.end;
      } else {
        curEnd = s.end;
      }
    }
    merged.push({ start: curStart, end: curEnd });
    // 仍超长（子句本身超长）按词边界硬切，防止单次 TTS 请求过大
    for (const m of merged) {
      if (m.end - m.start <= maxLen) out.push(m);
      else out.push(...hardSplitRange(text, m, maxLen));
    }
  }
  return out;
}

/** 硬切超长区间：优先在空白处断开，避免切断单词 */
function hardSplitRange(text: string, range: CharRange, maxLen: number): CharRange[] {
  const out: CharRange[] = [];
  let s = range.start;
  while (range.end - s > maxLen) {
    let cut = s + maxLen;
    let probe = cut;
    while (probe > s + 1 && !isWhitespace(text[probe])) probe--;
    if (probe <= s + 1) probe = cut; // 找不到空白（如中文）强切
    out.push({ start: s, end: probe });
    s = probe;
  }
  if (range.end > s) out.push({ start: s, end: range.end });
  return out;
}
