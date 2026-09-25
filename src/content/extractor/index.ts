/**
 * extractor — 网页正文采集器入口（原 `extractor.ts`）。
 *
 * 移植自 kiss-translator 的正文识别层（块级遍历 + 文本过滤 + 站点规则），
 * 改造为纯只读采集器：不注入 DOM、不修改页面，仅输出有序段落文本。
 *
 * 拆分见同目录各模块：selectors（选择器常量）/ site-rules（站点规则）/
 * skip-patterns（噪声过滤）/ pattern-match（通配符匹配）/ block-detection
 * （块级判定）/ addressable-text（可寻址文本）/ traversal（核心遍历）。
 *
 * 输出约定：段落之间用 "\n\n" 连接——SentencePlayer.setText 只按 /\n\n+/
 * 识别段落边界（决定播放停顿与展示换行）。
 */
import { BUILTIN_IGNORE_SELECTOR, SELF_IGNORE_SELECTOR } from './selectors';
import { DEFAULT_RULE, ExtractRule, SITE_RULES } from './site-rules';
import { matchesRulePattern } from './pattern-match';
import { isValidText } from './skip-patterns';
import { hasTextNode, isBlockNode, matchesBlockSelector } from './block-detection';
import { isVisibleUnit, readAddressableText } from './addressable-text';
import { collectTargets } from './traversal';

// 公共导出保持原文件形状不变（下游 player / sentence-map / reading-overlay / state 依赖）
export { DEFAULT_SELECTOR, DEFAULT_IGNORE_SELECTOR } from './selectors';
export { isMatch, matchesRulePattern } from './pattern-match';
export { isValidText } from './skip-patterns';
export { isBlockNode, hasTextNode } from './block-detection';
export { collectAddressableNodes, readAddressableText } from './addressable-text';

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
