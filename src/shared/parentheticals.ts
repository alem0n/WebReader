/** 括号匹配：删除括号及其中的内容（"删除括号内容"开关的底层实现） */

/** 开/闭括号配对表（中英文圆/方/花括号；不含书名号《》与引号） */
const PAREN_PAIRS: Record<string, string> = {
  '(': ')',
  '（': '）',
  '[': ']',
  '【': '】',
  '{': '}',
  '｛': '｝',
};

const PAREN_CLOSERS = new Set(Object.values(PAREN_PAIRS));

/** 半开字符区间 [start, end) */
export interface CharRange {
  start: number;
  end: number;
}

/**
 * 栈式嵌套匹配，删除括号及其中的全部内容。
 * - 未闭合的开括号：其后内容视为括号内一并删除
 * - 孤立的闭括号：原样保留
 * - 仅压缩同行多余空白，保留换行/段落结构
 */
export function stripParentheticals(text: string): string {
  if (!text) return text;
  const stack: string[] = []; // 期望的闭括号栈
  let out = '';
  for (const ch of text) {
    if (PAREN_PAIRS[ch]) {
      stack.push(PAREN_PAIRS[ch]); // 开括号：丢弃并记录期望的闭括号
    } else if (PAREN_CLOSERS.has(ch)) {
      if (stack.length > 0)
        stack.pop(); // 配对的闭括号：丢弃
      else out += ch; // 孤立的闭括号：保留
    } else if (stack.length === 0) {
      out += ch; // 括号外内容：保留
    }
  }
  // 清理删除点附近残留的多余空格（仅压缩同行空白，保留换行/段落结构）
  return out.replace(/[ \t]{2,}/g, ' ');
}

/**
 * 栈式嵌套匹配，返回被「删除括号内容」移除的字符区间（半开区间，按字符串索引计）。
 *
 * 与 stripParentheticals 同一套配对语义，但不重建字符串，而是给出**移除位置**：
 * 需要保留原文本结构（如网页内逐句高亮：原文必须留在 DOM 原位，只是某些句子
 * 不朗读）的场景，据此精确剔除括号内容，其余字符与 DOM 逐字对齐。
 *
 * - 未闭合的开括号：其后全部内容视为括号内，记为移除区间
 * - 孤立的闭括号：保留（不计入移除区间）
 * - 嵌套括号：由合并步骤归并到最外层区间
 */
export function getParentheticalRemovedRanges(text: string): CharRange[] {
  if (!text) return [];

  const removed: CharRange[] = [];
  const stack: Array<{ open: number; expect: string }> = [];
  let i = 0;
  for (const ch of text) {
    if (PAREN_PAIRS[ch]) {
      stack.push({ open: i, expect: PAREN_PAIRS[ch] });
    } else if (PAREN_CLOSERS.has(ch)) {
      if (stack.length > 0) {
        const top = stack.pop() as { open: number; expect: string };
        removed.push({ start: top.open, end: i + ch.length });
      }
    }
    i += ch.length; // 按字符串真实索引推进（兼容 emoji 等增补平面字符）
  }
  // 未闭合的开括号：从开括号到文本末尾全部移除
  for (const top of stack) removed.push({ start: top.open, end: text.length });

  return mergeCharRanges(removed);
}

/**
 * 计算区间集合在 [rangeStart, rangeEnd) 内的**补集**：即应被保留的子区间。
 *
 * removed 须为合并后的有序区间（getParentheticalRemovedRanges 已保证）。
 */
export function subtractCharRanges(rangeStart: number, rangeEnd: number, removed: CharRange[]): CharRange[] {
  const kept: CharRange[] = [];
  let cur = rangeStart;
  for (const r of removed) {
    if (r.end <= cur) continue; // 完全在左侧
    if (r.start >= rangeEnd) break; // 完全在右侧
    if (r.start > cur) kept.push({ start: cur, end: Math.min(r.start, rangeEnd) });
    cur = Math.max(cur, r.end);
    if (cur >= rangeEnd) break;
  }
  if (cur < rangeEnd) kept.push({ start: cur, end: rangeEnd });
  return kept;
}

/** 合并重叠/相邻/嵌套的区间并按起点排序（供区间运算前归一化） */
export function mergeCharRanges(ranges: CharRange[]): CharRange[] {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: CharRange[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const last = out[out.length - 1];
    if (r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}
