/**
 * kiss-translator「仅译文」模式兼容性回归（jsdom）
 *
 * 守护「kiss-translator 隐藏原文只显示译文时，整页朗读仍能采集到译文」。
 * 结构一律采用 kiss-translator 的真实类名（APP_LCNAME = "kiss-translator"）：
 *   <kiss-translator class="kiss-translator-wrapper notranslate">
 *     <template class="kiss-translator-backup"> 原文（惰性，已搬离渲染树） </template>
 *     <font class="kiss-translator-inner" lang="zh-CN"> 译文 </font>
 *   </kiss-translator>
 *
 * 运行：node test/kiss-compat.smoke.mjs
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
// jsdom 全局环境
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
// 打包采集器
// ---------------------------------------------------------------------------

const outfile = resolve(__dirname, '.kiss-compat.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/extractor/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

const { extractPageText, collectPageUnits } = await import(pathToFileURL(outfile).href);

// ---------------------------------------------------------------------------
// 工具：按 kiss-translator 真实行为构造「仅译文」DOM
// ---------------------------------------------------------------------------()

/**
 * 模拟 kiss-translator「仅译文」模式对宿主 <p> 的改造（translator.js）：
 * 原文 TextNode 被搬进 wrapper 内的 template 备份，译文写入 <font class="kiss-translator-inner">
 */
function applyKissTranslationOnly(p, originalText, translatedText) {
  const original = document.createTextNode(originalText);

  const backup = document.createElement('template');
  backup.className = 'kiss-translator-backup';
  backup.content.appendChild(original); // 原文离开渲染树

  const inner = document.createElement('font');
  inner.className = 'kiss-translator-inner';
  inner.lang = 'zh-CN';
  inner.textContent = translatedText;

  const wrapper = document.createElement('kiss-translator');
  wrapper.className = 'kiss-translator-wrapper notranslate';
  wrapper.appendChild(backup);
  wrapper.appendChild(inner);

  p.replaceChildren(wrapper);
}

function setPage(html) {
  document.body.innerHTML = html;
}

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
console.log('\n[DOM 前置事实]');

test('template 备份的原文不在渲染树内（kiss 仅译文模式的核心前提）', () => {
  setPage(`<p id="p1"></p>`);
  applyKissTranslationOnly(document.getElementById('p1'), 'Hello world.', '你好世界。');

  const p = document.getElementById('p1');
  const backup = p.querySelector('template.kiss-translator-backup');
  assert.ok(backup, '应存在 template 备份');
  assert.ok(backup.content.textContent.includes('Hello world.'), '原文在 template.content 内');

  // template 元素在主树中没有子节点；其子节点在 .content DocumentFragment 里
  assert.equal(backup.childNodes.length, 0, 'template.childNodes 应为空');
  assert.equal(p.textContent.includes('Hello world.'), false, '宿主渲染树文本不含原文');
  assert.equal(p.textContent.includes('你好世界。'), true, '宿主渲染树文本含译文');
});

test('TreeWalker 不会遍历进 template.content（决定是否需要额外过滤原文）', () => {
  setPage(`<p id="p1"></p>`);
  applyKissTranslationOnly(document.getElementById('p1'), 'Hello world.', '你好世界。');

  const wrapper = document.getElementById('p1').querySelector('.kiss-translator-wrapper');
  const collected = [];
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
    acceptNode: () => NodeFilter.FILTER_ACCEPT,
  });
  let n;
  while ((n = walker.nextNode())) collected.push(n.nodeValue);

  // 若 TreeWalker 能进 template，结果会同时含原文与译文
  assert.ok(
    !collected.join('').includes('Hello world.'),
    `TreeWalker 不应读到 template 内原文，实际：${JSON.stringify(collected)}`,
  );
  assert.ok(collected.join('').includes('你好世界。'), '应读到译文');
});

// ===========================================================================
console.log('\n[修复后：仅译文模式整页朗读]');

test('能采集到全部译文段落', () => {
  setPage(`<article><h1 id="h1"></h1><p id="p1"></p><p id="p2"></p></article>`);
  applyKissTranslationOnly(document.getElementById('h1'), 'Article Title', '文章标题');
  applyKissTranslationOnly(document.getElementById('p1'), 'First paragraph.', '第一段正文。');
  applyKissTranslationOnly(document.getElementById('p2'), 'Second paragraph.', '第二段正文。');

  const paras = extractPageText().split('\n\n');
  assert.equal(paras.length, 3, `期望 3 段，实际 ${paras.length}：${JSON.stringify(paras)}`);
  assert.equal(paras[0], '文章标题');
  assert.equal(paras[1], '第一段正文。');
  assert.equal(paras[2], '第二段正文。');
});

test('采集结果不含被隐藏的原文', () => {
  setPage(`<article><p id="p1"></p></article>`);
  applyKissTranslationOnly(document.getElementById('p1'), 'Hello world.', '你好世界。');

  const text = extractPageText();
  assert.ok(!text.includes('Hello world.'), `不该采集原文备份，实际：${JSON.stringify(text)}`);
  assert.equal(text, '你好世界。');
});

test('collectPageUnits 的单元落在译文容器内，可逐句高亮', () => {
  setPage(`<article><p id="p1"></p></article>`);
  applyKissTranslationOnly(document.getElementById('p1'), 'Hello world.', '你好世界。');

  const units = collectPageUnits();
  assert.equal(units.length, 1, `期望 1 单元，实际 ${units.length}`);
  assert.equal(units[0].text, '你好世界。');
  // 单元元素是译文容器或其内部的 .kiss-translator-inner，供句子映射回指高亮
  const el = units[0].element;
  assert.ok(
    el.closest('.kiss-translator-wrapper'),
    `单元元素应在译文容器内，实际为 <${el.nodeName}>`,
  );
});

test('普通 .notranslate 元素仍被忽略（未过度放行）', () => {
  // 非 kiss 译文容器的 notranslate 标记保持原有忽略行为
  setPage(`<article><p>正常正文。</p><p class="notranslate">不要朗读这段。</p></article>`);
  const paras = extractPageText().split('\n\n');
  assert.equal(paras.length, 1);
  assert.equal(paras[0], '正常正文。');
});

// ===========================================================================
console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

if (failed > 0) {
  process.exitCode = 1;
}
