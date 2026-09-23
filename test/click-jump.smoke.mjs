/**
 * 点击跳转判定冒烟测试（jsdom）
 *
 * 覆盖 reading-overlay.resolveClickJumpTarget 的全部排除规则与命中逻辑：
 *  - 命中 span（含后代文本节点）→ 返回正确下标
 *  - span 内链接/按钮/输入 → null（放行默认行为）
 *  - Ctrl/Cmd/Alt + 点击 → null
 *  - 拖选（位移 > 6px）→ null
 *  - span 外普通文字 → null
 *  - 无 map → null
 *  - 下标越界 → null
 *
 * 运行：node test/click-jump.smoke.mjs
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
    <p id="p2">带<a href="#link">链接</a>的句子。普通句子。</p>
    <p id="p3">带<b>加粗</b>的句子。</p>
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
const bundleSentenceMap = resolve(__dirname, '.cjs-smap.bundle.mjs');
const bundleOverlay = resolve(__dirname, '.cjs-overlay.bundle.mjs');
const bundleStyles = resolve(__dirname, '.cjs-styles.bundle.mjs');

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

const { collectPageForReading } = await import(pathToFileURL(bundleSentenceMap).href);
const overlay = await import(pathToFileURL(bundleOverlay).href);
const { injectReadingStyles, READING_CLASS } = await import(pathToFileURL(bundleStyles).href);

const { units, map } = collectPageForReading();
injectReadingStyles();
overlay.prepareReadingOverlay(units, map);

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

/** 构造一个冒泡到 document 的点击事件，target 为指定节点 */
function click(target, { clientX = 10, clientY = 10, downX = 10, downY = 10, mods = {} } = {}) {
  const down = { x: downX, y: downY };
  const evt = new dom.window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    altKey: !!mods.alt,
  });
  Object.defineProperty(evt, 'target', { value: target, configurable: true });
  return overlay.resolveClickJumpTarget(evt, map, down);
}

// 找到 p1 的第一个句子 span
const p1Spans = [...document.querySelectorAll(`#p1 span.${READING_CLASS.sentence}`)];
const firstSpan = p1Spans[0];
const firstIdx = Number(firstSpan.dataset.ttsSentence);

// ===========================================================================
console.log('\n[命中：点击句子 span]');
test('点击 span 元素本身 → 返回该句下标', () => {
  assert.equal(click(firstSpan), firstIdx);
});
test('点击 span 内部文本节点 → 返回该句下标', () => {
  const textNode = firstSpan.firstChild;
  assert.equal(click(textNode), firstIdx);
});
test('点击 span 内行内元素（b 加粗里的 span）→ 返回该句下标', () => {
  // 包裹后结构为 <b><span>加粗</span></b>：span 在 b 内部
  const b = document.querySelector(`#p3 b`);
  const spanInB = b && b.querySelector(`span.${READING_CLASS.sentence}`);
  assert.ok(spanInB, 'p3 的 <b> 内应有句子 span');
  assert.equal(click(spanInB), Number(spanInB.dataset.ttsSentence));
});

// ===========================================================================
console.log('\n[放行：不应触发跳转]');
test('点击链接内的句子 span → null（放行默认行为）', () => {
  // 包裹后结构为 <a><span>链接</span></a>：span 在 a 内部，点击它应放行
  const a = document.querySelector(`#p2 a`);
  const spanInA = a && a.querySelector(`span.${READING_CLASS.sentence}`);
  assert.ok(spanInA, 'p2 的 <a> 内应有句子 span');
  assert.equal(click(spanInA), null);
});
test('点击页面普通文字（无 span）→ null', () => {
  const plain = document.querySelector('article');
  assert.equal(click(plain), null);
});
test('无句子映射 → null', () => {
  const evt = new dom.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
  Object.defineProperty(evt, 'target', { value: firstSpan, configurable: true });
  assert.equal(overlay.resolveClickJumpTarget(evt, null, { x: 10, y: 10 }), null);
});
test('空句子映射 → null', () => {
  const evt = new dom.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
  Object.defineProperty(evt, 'target', { value: firstSpan, configurable: true });
  assert.equal(overlay.resolveClickJumpTarget(evt, { sentences: [], ownerIndex: [], ranges: [], paragraphBreakAfterIndex: new Set() }, { x: 10, y: 10 }), null);
});

// ===========================================================================
console.log('\n[修饰键：放行]');
test('Ctrl + 点击 → null', () => {
  assert.equal(click(firstSpan, { mods: { ctrl: true } }), null);
});
test('Meta(Cmd) + 点击 → null', () => {
  assert.equal(click(firstSpan, { mods: { meta: true } }), null);
});
test('Alt + 点击 → null', () => {
  assert.equal(click(firstSpan, { mods: { alt: true } }), null);
});

// ===========================================================================
console.log('\n[拖选判定]');
test('点击与 mousedown 同位置 → 正常命中', () => {
  assert.equal(click(firstSpan, { clientX: 10, clientY: 10, downX: 10, downY: 10 }), firstIdx);
});
test('微小位移（< 6px）→ 正常命中', () => {
  assert.equal(click(firstSpan, { clientX: 13, clientY: 12, downX: 10, downY: 10 }), firstIdx);
});
test('拖选位移（> 6px）→ null（用户在选择文字）', () => {
  assert.equal(click(firstSpan, { clientX: 40, clientY: 30, downX: 10, downY: 10 }), null);
});
test('pointerDown 为 null（异常情况）→ 仍按点击处理', () => {
  const evt = new dom.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
  Object.defineProperty(evt, 'target', { value: firstSpan, configurable: true });
  assert.equal(overlay.resolveClickJumpTarget(evt, map, null), firstIdx);
});

// ===========================================================================
console.log('\n[越界保护]');
test('span 的 data-tts-sentence 超出 map 范围 → null', () => {
  // 手动造一个越界 span
  const fake = document.createElement('span');
  fake.className = READING_CLASS.sentence;
  fake.dataset.ttsSentence = String(map.sentences.length + 5);
  const evt = new dom.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 });
  Object.defineProperty(evt, 'target', { value: fake, configurable: true });
  assert.equal(overlay.resolveClickJumpTarget(evt, map, { x: 10, y: 10 }), null);
});

// ===========================================================================
console.log('\n[悬停样式：与激活态共用同一组规则]');
test('样式表含 :hover 规则且与 active 共用选择器', () => {
  // jsdom 可能支持 CSSStyleSheet（走 adoptedStyleSheets）也可能不支持（走 <style>）
  let css = '';
  const style = document.getElementById('tts-reading-styles');
  if (style) {
    css = style.textContent;
  } else {
    const sheets = document.adoptedStyleSheets || [];
    css = sheets
      .map((s) => {
        // 从 cssRules 提取文本（CSSSheet.toString() 只返回对象标签）
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
  assert.ok(css, '应有注入的样式表（<style> 或 adoptedStyleSheets）');
  assert.ok(css.includes(`span.${READING_CLASS.sentence}:hover`), '应含 :hover 规则');
  assert.ok(css.includes(`span.${READING_CLASS.sentence}.${READING_CLASS.active}`), '应含 active 规则');
  // 二者在同一条规则里（逗号分隔），保证样式一致
  const ruleLine = css.split('\n').find((l) => l.includes(':hover'));
  assert.ok(ruleLine && ruleLine.includes(READING_CLASS.active), ':hover 应与 active 同一条规则');
  assert.ok(css.includes('cursor: pointer'), '悬停应有可点击手势');
});

// ===========================================================================
// 汇总
// ===========================================================================
for (const b of [bundleSentenceMap, bundleOverlay, bundleStyles]) rmSync(b, { force: true });

console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

if (failed > 0) {
  process.exitCode = 1;
}
