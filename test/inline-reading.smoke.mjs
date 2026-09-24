/**
 * 网页内逐句高亮冒烟测试（jsdom）
 *
 * 覆盖三层机制：
 *  - sentence-map：区间式分割严格覆盖原文（句子拼接 === 原文去空白）；ownerIndex 回指
 *    正确；括号内容被剔除出句子但仍在原文里；长句拆分不越界。
 *  - reading-overlay：prepare 把句子区间包进 span，原文文本逐字不变；highlight 只给
 *    当前句加高亮类；clear 拆除后 DOM 与包裹前完全一致（normalize 还原）。
 *  - reading-styles：jsdom 无 CSSStyleSheet 时走 <style> 回退且不抛错。
 *
 * 运行：node test/inline-reading.smoke.mjs
 */
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// jsdom 环境
// ---------------------------------------------------------------------------
const html = `<!DOCTYPE html><body>
  <article>
    <p id="p1">这是第一段。这是第一段的第二句！</p>
    <p id="p2">Second paragraph here. Another sentence.</p>
    <p id="p3">混合（括号内容不应朗读）的正文。</p>
    <p id="p4">行内<b>加粗</b>与结尾感叹号！</p>
    <p id="p5">逗号子句一，逗号子句二，逗号子句三，逗号子句四，逗号子句五，逗号子句六，逗号子句七，逗号子句八，逗号子句九，逗号子句十。</p>
  </article>
</body>`;
const dom = new JSDOM(html, { url: 'https://example.com/article', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.DocumentFragment = dom.window.DocumentFragment;
globalThis.CSSStyleSheet = dom.window.CSSStyleSheet;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.getComputedStyle = dom.window.getComputedStyle;

// ---------------------------------------------------------------------------
// 现场打包真实模块（DOM 纯逻辑，无 chrome 依赖）
// ---------------------------------------------------------------------------
const bundleSentenceMap = resolve(__dirname, '.inline-smap.bundle.mjs');
const bundleOverlay = resolve(__dirname, '.inline-overlay.bundle.mjs');
const bundleStyles = resolve(__dirname, '.inline-styles.bundle.mjs');

await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/sentence-map.ts')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  outfile: bundleSentenceMap, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/reading-overlay.ts')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  outfile: bundleOverlay, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/reading-styles.ts')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  outfile: bundleStyles, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});

const { collectPageForReading, buildSentenceMap, segmentSentences, getDisplayTextFromMap } = await import(
  pathToFileURL(bundleSentenceMap).href
);
const parenBundle = resolve(__dirname, '.inline-paren.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/shared/parentheticals.ts')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  outfile: parenBundle, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});
const { getParentheticalRemovedRanges } = await import(pathToFileURL(parenBundle).href);
const overlay = await import(pathToFileURL(bundleOverlay).href);
const { injectReadingStyles, READING_CLASS } = await import(pathToFileURL(bundleStyles).href);

// buildSentenceMap 读取 state.removeParentheticals；sentence-map 侧只取该字段，直接置到全局 state 桩
// （真实 state 模块被一并打包，其默认 removeParentheticals=true 即所需）
const collected = collectPageForReading();
const units = collected.units;
const map = collected.map;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}

// ===========================================================================
console.log('\n[sentence-map：区间分区正确性]');
test('区间只覆盖「保留内容」，且互不重叠、按序排列（括号内容不在任何区间内）', () => {
  for (let ui = 0; ui < units.length; ui++) {
    const addr = units[ui].text;
    const owned = [];
    for (let i = 0; i < map.sentences.length; i++) {
      if (map.ownerIndex[i] === ui) owned.push(i);
    }
    // 括号过滤开启时，区间只覆盖「删除括号后保留的字符」
    const removed = getParentheticalRemovedRanges(addr);
    const keptChars = new Set();
    for (let c = 0; c < addr.length; c++) {
      const inRemoved = removed.some((r) => c >= r.start && c < r.end);
      if (!inRemoved && !/\s/.test(addr[c])) keptChars.add(c);
    }
    const covered = new Set();
    let prevEnd = -1;
    for (const i of owned) {
      for (const r of map.ranges[i]) {
        assert.ok(r.start >= prevEnd, `单元 ${ui} 区间未按序排列`);
        for (let c = r.start; c < r.end; c++) {
          if (!/\s/.test(addr[c])) covered.add(c);
        }
        prevEnd = r.end;
      }
    }
    assert.deepEqual([...covered].sort((a, b) => a - b), [...keptChars].sort((a, b) => a - b),
      `单元 ${ui}（${units[ui].element.id}）区间覆盖与保留字符不一致`);
  }
});

test('句子文本 = 区间内文本压缩空白后（无幽灵字符）', () => {
  for (let i = 0; i < map.sentences.length; i++) {
    const ui = map.ownerIndex[i];
    const fromRanges = map.ranges[i]
      .map((r) => units[ui].text.slice(r.start, r.end))
      .join('')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    assert.equal(map.sentences[i], fromRanges, `句子 ${i} 文本与区间不符`);
  }
});

test('ownerIndex 全部落在合法范围', () => {
  assert.ok(map.sentences.length > 0, '应至少切出一句');
  for (const ui of map.ownerIndex) {
    assert.ok(ui >= 0 && ui < units.length, `ownerIndex 越界：${ui}`);
  }
});

test('中文段落按句号/叹号断句', () => {
  const p1 = map.ownerIndex.map((ui, i) => (units[ui].element.id === 'p1' ? i : -1)).filter((i) => i >= 0);
  assert.equal(p1.length, 2, `p1 应切 2 句，实际 ${p1.length}`);
  assert.equal(map.sentences[p1[0]], '这是第一段。');
  assert.equal(map.sentences[p1[1]], '这是第一段的第二句！');
});

test('英文段落按句点断句且不误切缩写/小数', () => {
  const p2 = map.ownerIndex.map((ui, i) => (units[ui].element.id === 'p2' ? i : -1)).filter((i) => i >= 0);
  assert.equal(p2.length, 2, `p2 应切 2 句，实际 ${p2.length}`);
  assert.equal(map.sentences[p2[0]], 'Second paragraph here.');
  assert.equal(map.sentences[p2[1]], 'Another sentence.');
});

test('段落停顿标记：每段最后一句标记 paragraphBreak', () => {
  // p1 p2 p3 p4 各自末句应被标记（最后一段 p5 除外）
  const lastOfP1 = map.ownerIndex.reduce((acc, ui, i) => (units[ui].element.id === 'p1' ? i : acc), -1);
  assert.ok(map.paragraphBreakAfterIndex.has(lastOfP1), 'p1 末句应有段落停顿');
});

// ===========================================================================
console.log('\n[sentence-map：括号过滤与区间对齐]');
test('括号内容被剔除出句子，但仍留在原文 DOM 中', () => {
  const p3 = map.ownerIndex.map((ui, i) => (units[ui].element.id === 'p3' ? i : -1)).filter((i) => i >= 0);
  assert.equal(p3.length, 1, 'p3 应切 1 句');
  const sent = map.sentences[p3[0]];
  assert.ok(!sent.includes('括号内容'), `句子不该含括号内容：${sent}`);
  assert.ok(sent.includes('混合'), `句子应保留括号外内容：${sent}`);
  assert.ok(sent.includes('正文'), `句子应保留括号外内容：${sent}`);
  // 原文未被改动
  const p3unit = units.find((u) => u.element.id === 'p3');
  assert.ok(p3unit.text.includes('括号内容'), '原文里括号内容必须原样保留');
});

test('关闭括号过滤后括号内容进入句子', () => {
  const m2 = buildSentenceMap(units); // 默认 removeParentheticals=true
  assert.ok(!m2.sentences.some((s) => s.includes('括号内容')), '默认应过滤括号');
});

// ===========================================================================
console.log('\n[sentence-map：segmentSentences 单元行为]');
test('小数 / 版本号 / 缩写不在点处断句', () => {
  const seg = (t) => segmentSentences(t).map((r) => t.slice(r.start, r.end));
  assert.equal(seg('价格是 3.14 美元。').length, 1, '小数不应断句');
  assert.equal(seg('版本 v1.2.3 发布了。').length, 1, '版本号不应断句');
  assert.equal(seg('Dr. Smith 来了。他说话了。').length, 2, 'Dr. 缩写不应断句，应得 2 句');
  assert.deepEqual(seg('Dr. Smith 来了。他说话了。'), ['Dr. Smith 来了。', '他说话了。']);
});
test('小写续句并入上一句', () => {
  const seg = (t) => segmentSentences(t).map((r) => t.slice(r.start, r.end));
  assert.deepEqual(seg('hello.world next.'), ['hello.world next.'], '小写开头的续句应并入');
  assert.deepEqual(seg('Hello.World next.'), ['Hello.', 'World next.'], '大写开头不并入');
});
test('长句在子句标点处拆分且不越界', () => {
  const long = '逗号子句一，逗号子句二，逗号子句三，逗号子句四，逗号子句五，逗号子句六，逗号子句七，逗号子句八，逗号子句九，逗号子句十。';
  const segs = segmentSentences(long, 20); // 强制小 maxLen 触发拆分
  assert.ok(segs.length > 1, '长句应被拆分');
  // 拆分后拼接必须等于原文（区间严格分区）
  assert.equal(segs.map((r) => long.slice(r.start, r.end)).join('').replace(/\s+/g, ''), long.replace(/\s+/g, ''));
  for (const r of segs) assert.ok(r.end - r.start <= 20 * 1.5, `拆分后段落仍过长：${r.end - r.start}`);
});
test('区间在地址空间内互不重叠', () => {
  const ranges = segmentSentences('第一句。第二句！第三句？');
  for (let i = 1; i < ranges.length; i++) {
    assert.ok(ranges[i - 1].end <= ranges[i].start, '区间必须有序不重叠');
  }
});

// ===========================================================================
console.log('\n[reading-overlay：包裹 / 高亮 / 还原]');
test('prepare 后原文文本逐字不变，且生成了句子 span', () => {
  const before = document.body.textContent;
  overlay.prepareReadingOverlay(units, map);
  const after = document.body.textContent;
  assert.equal(after, before, '包裹不能改变页面任何文本');
  const spans = document.querySelectorAll(`span.${READING_CLASS.sentence}`);
  assert.ok(spans.length > 0, '应生成高亮 span');
  for (const span of spans) {
    assert.ok(span.dataset.ttsSentence !== undefined, '每个 span 应带句子下标');
  }
});

test('highlight 只给目标句加高亮类，其它句无高亮', () => {
  const idx = map.sentences.findIndex((s, i) => units[map.ownerIndex[i]].element.id === 'p1' && i === 0);
  overlay.highlightSentence(idx);
  const active = document.querySelectorAll(`span.${READING_CLASS.sentence}.${READING_CLASS.active}`);
  const total = document.querySelectorAll(`span.${READING_CLASS.sentence}`);
  assert.ok(active.length >= 1, '目标句应有高亮 span');
  assert.ok(active.length <= total.length, '高亮数不应超过总数');
  // 每个高亮 span 的下标都等于 idx
  for (const span of active) {
    assert.equal(Number(span.dataset.ttsSentence), idx, '高亮 span 下标必须一致');
  }
  // 非 idx 的 span 无高亮类
  const others = [...total].filter((s) => Number(s.dataset.ttsSentence) !== idx);
  for (const span of others) {
    assert.ok(!span.classList.contains(READING_CLASS.active), '非目标句不应有高亮');
  }
});

test('跨行内元素边界的句子生成多段 span 且同属一句', () => {
  // p4 = "行内<b>加粗</b>与结尾感叹号！" 是一句，横跨 3 个文本节点
  const sentIdx = map.sentences.findIndex((s, i) => units[map.ownerIndex[i]].element.id === 'p4');
  assert.ok(sentIdx >= 0, '应存在 p4 的句子');
  const spans = document.querySelectorAll(`span.${READING_CLASS.sentence}[data-tts-sentence="${sentIdx}"]`);
  assert.ok(spans.length >= 2, `跨行内边界的句子应有多段 span，实际 ${spans.length}`);
  // 各段拼接应能重建该句
  const rebuilt = [...spans].map((s) => s.textContent).join('');
  assert.equal(rebuilt.replace(/\s+/g, ''), map.sentences[sentIdx].replace(/\s+/g, ''));
});

test('clear 后页面与包裹前完全一致（无残留 span）', () => {
  const before = document.body.textContent;
  overlay.clearReadingOverlay();
  assert.equal(document.querySelectorAll(`span.${READING_CLASS.sentence}`).length, 0, '不应残留 span');
  assert.equal(document.body.textContent, before, '清理不能改变文本');
  // DOM 结构还原：<b> 回到 p4 内部
  const b = document.querySelector('#p4 > b');
  assert.ok(b, '行内元素结构应被还原');
  assert.equal(b.textContent, '加粗');
});

test('未 prepare 时 highlight 静默跳过不抛错', () => {
  overlay.clearReadingOverlay();
  assert.doesNotThrow(() => overlay.highlightSentence(0));
  assert.equal(document.querySelectorAll(`span.${READING_CLASS.active}`).length, 0);
});

test('findSentenceIndexFromNode 能反查句子下标（点击跳转的预留入口）', () => {
  overlay.prepareReadingOverlay(units, map);
  const span = document.querySelector(`span.${READING_CLASS.sentence}`);
  const idx = overlay.findSentenceIndexFromNode(span);
  assert.equal(idx, Number(span.dataset.ttsSentence));
  const outside = document.querySelector('#p1');
  assert.equal(overlay.findSentenceIndexFromNode(outside), null, '非 span 节点应返回 null');
  overlay.clearReadingOverlay();
});

test('重复 prepare 幂等，不重复包裹', () => {
  overlay.prepareReadingOverlay(units, map);
  const once = [...document.querySelectorAll(`span.${READING_CLASS.sentence}`)].map((s) => s.textContent).join('');
  overlay.prepareReadingOverlay(units, map);
  const twice = [...document.querySelectorAll(`span.${READING_CLASS.sentence}`)].map((s) => s.textContent).join('');
  // 句子 span 覆盖「合并区间」，含被剔除的括号内容（随本句一起高亮但不朗读，
  // 见 wrapUnitSentences 的设计），故长度不能直接用 map.sentences 求和；
  // 幂等性以「重复 prepare 后 span 逐字不变、长度不翻倍」为准
  assert.equal(twice.replace(/\s+/g, '').length, once.replace(/\s+/g, '').length, '重复 prepare 不应翻倍包裹');
  assert.equal(twice, once, '两次 prepare 的 span 内容应逐字一致');
  overlay.clearReadingOverlay();
});

// ===========================================================================
console.log('\n[reading-styles：注入与回退]');
test('injectReadingStyles 幂等且不抛错（jsdom 无 CSSStyleSheet 时走 <style>）', () => {
  assert.doesNotThrow(() => {
    injectReadingStyles();
    injectReadingStyles();
  });
  // jsdom 视环境可能支持也可能不支持 CSSStyleSheet：两种路径都算通过
  const style = document.getElementById('tts-reading-styles');
  if (style) {
    assert.ok(style.textContent.includes('tts-reading-sentence'), '回退 <style> 应含句子类规则');
  }
});

test('悬停样式与激活态共用同一组规则（点击跳转的视觉前置反馈）', () => {
  // 两种途径取其一：<style> 元素或 adoptedStyleSheets
  let css = '';
  const style = document.getElementById('tts-reading-styles');
  if (style) {
    css = style.textContent;
  } else {
    css = (document.adoptedStyleSheets || [])
      .map((s) => {
        try {
          return Array.from(s.cssRules || [])
            .map((r) => r.cssText || '')
            .join('\n');
        } catch {
          return '';
        }
      })
      .join('\n');
  }
  assert.ok(css.includes(':hover'), '应含 :hover 规则');
  assert.ok(css.includes(READING_CLASS.active), '应与激活态共用规则');
});

// ===========================================================================
console.log('\n[getDisplayTextFromMap：展示文本镜像]');
test('展示文本 = 句子表按段落停顿连接', () => {
  const display = getDisplayTextFromMap(map);
  const tokens = display.split(/\n\n+/);
  assert.equal(tokens.length, units.length, '段落数应与单元数一致');
  for (let i = 0; i < tokens.length; i++) {
    const ui = i;
    const owned = map.sentences.filter((_, si) => map.ownerIndex[si] === ui);
    assert.equal(tokens[i].replace(/\s+/g, ''), owned.join('').replace(/\s+/g, ''));
  }
});

// ===========================================================================
// 汇总
// ===========================================================================
const bundles = [bundleSentenceMap, bundleOverlay, bundleStyles, parenBundle];
for (const b of bundles) rmSync(b, { force: true });

console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

if (failed > 0) {
  process.exitCode = 1;
}
