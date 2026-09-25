/**
 * page-fab 冒烟测试（jsdom）
 *
 * 验证核心行为：有正文的页面 → 悬浮按钮出现；空页面 → 不出现。
 * jsdom 无 requestIdleCallback，会走 setTimeout 回退路径（顺带覆盖）。
 *
 * 运行：node test/fab.smoke.mjs
 */
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`); }
}

async function bundleTo(outfile) {
  await esbuild.build({
    entryPoints: [resolve(__dirname, '../src/content/page-fab.ts')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
    outfile, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

function setGlobals(dom) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.DocumentFragment = dom.window.DocumentFragment;
  globalThis.getComputedStyle = dom.window.getComputedStyle;
 globalThis.NodeFilter = dom.window.NodeFilter;
}

const tick = () => new Promise((r) => setTimeout(r, 120));
// 内容探测走 requestIdleCallback（jsdom 退化为 ~3s 的 setTimeout），需轮询等待
const waitFor = async (fn, timeoutMs = 4500) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await tick();
    if (fn()) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// 用例 1：有正文的页面 → 按钮出现
// ---------------------------------------------------------------------------
const dom1 = new JSDOM(
  '<!DOCTYPE html><body><article><h1>文章标题</h1><p>这是一段足够长的正文内容，用于通过有效性过滤。</p></article></body>',
  { url: 'https://example.com/article' }
);
setGlobals(dom1);
const mod1 = await bundleTo(resolve(__dirname, '.fab1.bundle.mjs'));
mod1.initPageFab();
await waitFor(() => !!document.querySelector('#tts-read-page-fab-host'), 4500);

console.log('\n[page-fab]');
test('有正文的页面：右下角悬浮按钮出现', () => {
  const host = document.querySelector('#tts-read-page-fab-host');
  assert.ok(host, '期望 #tts-read-page-fab-host 存在');
  // 按钮在 Shadow DOM 内，宿主被 append 到 body
  assert.ok(document.body.contains(host));
});
test('按钮可点击且位于 Shadow DOM 内（样式隔离）', () => {
  const host = document.querySelector('#tts-read-page-fab-host');
  const shadow = host.shadowRoot;
  assert.ok(shadow, '期望 Shadow DOM 已挂载');
  const button = shadow.querySelector('button');
  assert.ok(button, '期望按钮存在');
  assert.equal(button.tagName, 'BUTTON');
});
test('按钮有 aria-label / title 无障碍标注', () => {
  const button = document.querySelector('#tts-read-page-fab-host').shadowRoot.querySelector('button');
  assert.ok(button.getAttribute('aria-label') || button.title, '期望有无障碍标注');
});
test('宿主固定在右下角且不拦截页面事件', () => {
  const host = document.querySelector('#tts-read-page-fab-host');
  const cs = host.style;
  assert.ok(cs.position === 'fixed', '期望 position:fixed');
  assert.ok(cs.pointerEvents === 'none', '宿主 pointer-events:none，不挡页面交互');
});
test('按钮绝对定位且位于视口内，不会向右溢出视口', () => {
  // 宿主是 0x0 锚点：按钮绝对定位 + inline left/top（可拖动），
  // 坐标经 clampPos 钳制在视口内，否则会以宿主左边缘为起点向右溢出（历史回归）
  const host = document.querySelector('#tts-read-page-fab-host');
  const style = host.shadowRoot.querySelector('style').textContent;
  const button = host.shadowRoot.querySelector('button');
  assert.ok(/position:\s*absolute/.test(style), '按钮应为绝对定位');
  const left = parseFloat(button.style.left);
  const top = parseFloat(button.style.top);
  assert.ok(!Number.isNaN(left) && left >= 0 && left + 46 <= window.innerWidth, '按钮水平坐标应在视口内');
  assert.ok(!Number.isNaN(top) && top >= 0 && top + 46 <= window.innerHeight, '按钮垂直坐标应在视口内');
});

// ---------------------------------------------------------------------------
// 用例 2：空页面 → 按钮不出现（用独立 bundle 实例，避免模块级 host 缓存）
// ---------------------------------------------------------------------------
const dom2 = new JSDOM('<!DOCTYPE html><body></body>', { url: 'https://example.com/empty' });
setGlobals(dom2);
const mod2 = await bundleTo(resolve(__dirname, '.fab2.bundle.mjs'));
mod2.initPageFab();
await tick();
await new Promise((r) => setTimeout(r, 2700)); // 等待 2.5s 的 SPA 兜底探测
await tick();

test('空页面：不出现悬浮按钮', () => {
  assert.ok(!document.querySelector('#tts-read-page-fab-host'), '空页面不应出现按钮');
});

// ---------------------------------------------------------------------------
// 清理
// ---------------------------------------------------------------------------
import { rmSync } from 'node:fs';
for (const f of ['.fab1.bundle.mjs', '.fab2.bundle.mjs']) {
  rmSync(resolve(__dirname, f), { force: true });
}

console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);
if (failed > 0) process.exitCode = 1;
