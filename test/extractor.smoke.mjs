/**
 * extractor 冒烟测试（jsdom）
 *
 * 项目无测试框架，这里用 esbuild 现场把 extractor.ts 打包成 ESM，
 * 在 jsdom 环境中跑断言。jsdom 无布局引擎，innerText 不可用，
 * 采集器会回退到 textContent——因此断言以「结构与文本完整性」为主，
 * 「视觉顺序」以真实浏览器实测为准（见 plan.md 第 4 步）。
 *
 * 运行：node test/extractor.smoke.mjs
 */

import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// 1. 建立 jsdom 全局环境
// ---------------------------------------------------------------------------

const dom = new JSDOM('<!DOCTYPE html><body></body>', {
  url: 'https://example.com/article',
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.DocumentFragment = dom.window.DocumentFragment;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.NodeFilter = dom.window.NodeFilter;

// ---------------------------------------------------------------------------
// 2. 现场打包 extractor.ts
// ---------------------------------------------------------------------------

const outfile = resolve(__dirname, '.extractor.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/extractor.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

const extractor = await import(pathToFileURL(outfile).href);

const { extractPageText, isMatch, matchesRulePattern, isValidText } = extractor;

// ---------------------------------------------------------------------------
// 3. 工具
// ---------------------------------------------------------------------------

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

function setPage(html) {
  document.body.innerHTML = html;
}

function paragraphs() {
  return extractPageText().split('\n\n');
}

// ===========================================================================
// 纯函数：isMatch（通配符）
// ===========================================================================
console.log('\n[isMatch]');
test('完全包含即匹配', () => {
  assert.equal(isMatch('https://example.com/a', 'example.com'), true);
});
test('逗号分隔任一命中', () => {
  assert.equal(matchesRulePattern('https://x.com/home', 'twitter.com, https://x.com'), true);
  assert.equal(matchesRulePattern('https://twitter.com/x', 'twitter.com, https://x.com'), true);
  assert.equal(matchesRulePattern('https://other.com', 'twitter.com, https://x.com'), false);
});
test('更具体模式优先：live_chat 先于 youtube.com', () => {
  const rules = [
    { pattern: 'www.youtube.com/live_chat' },
    { pattern: 'www.youtube.com' },
  ];
  const hit = rules.find((r) => matchesRulePattern('https://www.youtube.com/live_chat', r.pattern));
  assert.equal(hit.pattern, 'www.youtube.com/live_chat');
});

// ===========================================================================
// 纯函数：isValidText
// ===========================================================================
console.log('\n[isValidText]');
test('普通句子有效', () => {
  assert.equal(isValidText('今天天气不错，适合出门散步。'), true);
});
test('空串与过短无效', () => {
  assert.equal(isValidText(''), false);
  assert.equal(isValidText(' '), false);
  assert.equal(isValidText('a'), false); // 单个非字母字符
  assert.equal(isValidText('ab'), true); // 恰好 2 字符有效
});
test('纯数字无效', () => {
  assert.equal(isValidText('12345'), false);
  assert.equal(isValidText('3.14'), false);
});
test('带单位的数字噪声无效（千分位/货币形式）', () => {
  // 忠实移植 kiss 的模式 #5：仅匹配「3 位内 + 千分位分隔」的数字，
  // 因此 1,024px / $1,299.00 被过滤；无分隔的 1024px 不在其内（原版行为）。
  assert.equal(isValidText('1,024px'), false);
  assert.equal(isValidText('$1,299.00'), false);
});
test('URL / 邮箱 / 版本号 / 日期无效', () => {
  assert.equal(isValidText('https://example.com/page'), false);
  assert.equal(isValidText('user@example.com'), false);
  assert.equal(isValidText('v1.2.3'), false);
  assert.equal(isValidText('2026-01-02'), false);
});
test('"3.14美元" 这类混合文本保留', () => {
  assert.equal(isValidText('3.14美元一个'), true);
});

// ===========================================================================
// 端到端：extractPageText
// ===========================================================================
console.log('\n[extractPageText - 基础]');
test('文章页：h1 + 多 p 全部采集', () => {
  setPage(`
    <h1>文章标题</h1>
    <p>第一段正文内容。</p>
    <p>第二段正文内容。</p>
  `);
  const paras = paragraphs();
  assert.equal(paras.length, 3);
  assert.equal(paras[0], '文章标题');
  assert.equal(paras[1], '第一段正文内容。');
  assert.equal(paras[2], '第二段正文内容。');
});

test('空页面返回空串', () => {
  setPage('');
  assert.equal(extractPageText(), '');
});

console.log('\n[extractPageText - 嵌套与下钻]');
test('div 包装层能下钻命中内层 p', () => {
  setPage(`
    <div class="wrapper"><div class="inner">
      <p>嵌套的段落。</p>
    </div></div>
  `);
  const paras = paragraphs();
  assert.equal(paras.length, 1);
  assert.equal(paras[0], '嵌套的段落。');
});

test('纯文本 + 块级子元素不产生重叠文本（关键回归点）', () => {
  // 采集 div 后不再下钻 <p>，因此只有 1 段，且同时含两处文本
  setPage(`
    <div class="mixed">引言文字<p>段落内容</p></div>
  `);
  const paras = paragraphs();
  assert.equal(paras.length, 1, `期望 1 段，实际 ${paras.length}：${JSON.stringify(paras)}`);
  assert.ok(paras[0].includes('引言文字'));
  assert.ok(paras[0].includes('段落内容'));
});

console.log('\n[extractPageText - 忽略规则]');
test('nav / footer / script / style 被忽略', () => {
  setPage(`
    <nav><p>导航链接 首页 关于</p></nav>
    <main>
      <p>正文段落。</p>
    </main>
    <footer><p>版权所有 2026</p></footer>
    <script>var x = "不应被读取";</script>
    <style>.x { color: red; }</style>
  `);
  const paras = paragraphs();
  assert.equal(paras.length, 1);
  assert.equal(paras[0], '正文段落。');
});

test('本扩展自身注入的 DOM 被忽略', () => {
  setPage(`
    <p>正文段落。</p>
    <div id="tts-widget-host"></div>
    <div id="tts-selection-button-host"></div>
    <div id="tts-context-invalidated-toast">插件已被重新加载或更新，请刷新当前页面后重试。</div>
  `);
  const paras = paragraphs();
  assert.equal(paras.length, 1);
  assert.equal(paras[0], '正文段落。');
});

test('透明元素被跳过', () => {
  setPage(`
    <p>可见段落。</p>
    <p style="opacity: 0">不可见段落。</p>
  `);
  const paras = paragraphs();
  assert.equal(paras.length, 1);
  assert.equal(paras[0], '可见段落。');
});

console.log('\n[extractPageText - 覆盖度]');
test('li / blockquote / figcaption 被采集', () => {
  setPage(`
    <ul><li>列表项一</li><li>列表项二</li></ul>
    <blockquote>引用的一段话。</blockquote>
    <figure><img src="a.png" /><figcaption>图片说明。</figcaption></figure>
  `);
  const paras = paragraphs();
  assert.ok(paras.includes('列表项一'));
  assert.ok(paras.includes('列表项二'));
  assert.ok(paras.includes('引用的一段话。'));
  assert.ok(paras.includes('图片说明。'));
});

test('噪声文本被过滤（URL / 纯数字）', () => {
  setPage(`
    <p>https://example.com/very/long/url</p>
    <p>12345</p>
    <p>真正的正文段落。</p>
  `);
  const paras = paragraphs();
  assert.equal(paras.length, 1);
  assert.equal(paras[0], '真正的正文段落。');
});

console.log('\n[extractPageText - selector 显式模式]');
test('autoScan=false 时仅采集 selector 命中元素', () => {
  setPage(`
    <article>
      <h2>标题</h2>
      <p>段落 A。</p>
      <div>裸 div 文本</div>
    </article>
  `);
  const out = extractPageText({ autoScan: 'false', selector: 'p' });
  const paras = out.split('\n\n');
  assert.equal(paras.length, 1);
  assert.equal(paras[0], '段落 A。');
});

test('selector 模式下嵌套命中不重叠', () => {
  setPage(`
    <div class="x">
      <p class="x">内层</p>
    </div>
  `);
  const out = extractPageText({ autoScan: 'false', selector: '.x' });
  const paras = out.split('\n\n');
  assert.equal(paras.length, 1, `期望 1 段，实际 ${paras.length}：${JSON.stringify(paras)}`);
  assert.ok(paras[0].includes('内层'));
});

// ===========================================================================
// 汇总
// ===========================================================================
console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

if (failed > 0) {
  process.exitCode = 1;
}
