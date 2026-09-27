/**
 * popup 界面语言切换回归（jsdom）
 *
 * 守护「主页中 / EN 切换按钮在引擎未配置时也能正常切换」，以及瞬态状态消息
 * 不再挤压导航胶囊换行（语言按钮位置漂移）。
 *
 * 修复前：index.ts 的初始化在未配置（无 MiMo Key / 无后端地址）时提前 return，
 * 不执行 setupEventListeners，语言按钮没有点击监听 → 点击无反应，必须先保存 Key
 * 触发 initPlayerAfterKeySave 才活过来。修复后绑定独立于配置状态。
 *
 * 运行：node test/language-toggle.smoke.mjs
 */
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// 把 popup.html 的 <link rel="stylesheet"> 内联成 <style>，让 jsdom 的
// getComputedStyle 能反映样式（jsdom 不抓取 chrome-extension:// 的外部 CSS）
// ---------------------------------------------------------------------------

function inlineCss(html) {
  return html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (m, href) => {
    const css = fs.readFileSync(resolve(__dirname, '../public', href), 'utf8');
    return `<style>\n${css}\n</style>`;
  });
}

const popupHtml = inlineCss(fs.readFileSync(resolve(__dirname, '../public/popup.html'), 'utf8'));

// ---------------------------------------------------------------------------
// jsdom + chrome 桩
// ---------------------------------------------------------------------------

const store = {};

const dom = new JSDOM(popupHtml, {
  url: 'chrome-extension://test/popup.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.NodeFilter = window.NodeFilter;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

window.chrome = {
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => {
      const action = msg && msg.action;
      if (action === 'loadI18nMessages') return cb({ success: true, messages: {} });
      if (action === 'checkApiKeyStatus') return cb({ success: true, hasKey: false, maskedKey: '' });
      if (action === 'checkRelayStatus') return cb({ success: false });
      if (action === 'toggleWidgetOnActiveTab') return cb({ success: true });
      return cb({ success: true });
    },
  },
  storage: {
    local: {
      get: (keys, cb) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
        return cb(out);
      },
      set: (obj, cb) => {
        Object.assign(store, obj);
        return cb && cb();
      },
    },
  },
  i18n: { getMessage: () => '' },
};
globalThis.chrome = window.chrome;

// ---------------------------------------------------------------------------
// 打包 popup 入口并导入（注册 DOMContentLoaded 监听），再手动派发事件
// ---------------------------------------------------------------------------

const outfile = resolve(__dirname, '.language-toggle.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/popup/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

await import(pathToFileURL(outfile).href);
// jsdom 由 HTML 字符串创建时 DOMContentLoaded 已触发，需手动再派发一次
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

const tick = () => new Promise((r) => setTimeout(r, 60));
await tick();
await tick();

// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

const byId = (id) => document.getElementById(id);
const label = () => byId('language-toggle-label').textContent;

console.log('\n[未配置状态：初始化提前 return 的分支]');

await test('未配置时配置面板展开（确认处在未配置分支）', () => {
  const panel = byId('config-panel');
  assert.ok(panel, 'config-panel 必须存在');
  assert.ok(!panel.classList.contains('hidden'), '未配置时应展开引导');
});

await test('初始界面语言为 en 时按钮显示「中文」', () => {
  assert.strictEqual(label(), '中文', `实际：${label()}`);
});

await test('未配置时点击语言按钮能切换（核心回归点）', async () => {
  byId('language-toggle-btn').click();
  await tick();
  await tick();
  assert.strictEqual(label(), 'EN', `切换后应显示 EN，实际：${label()}`);
  assert.strictEqual(store.interfaceLanguage, 'zh_CN', '应已持久化 zh_CN');
});

await test('再点一次切回英文', async () => {
  byId('language-toggle-btn').click();
  await tick();
  await tick();
  assert.strictEqual(label(), '中文', `切回后应显示中文，实际：${label()}`);
  assert.strictEqual(store.interfaceLanguage, 'en');
});

console.log('\n[布局：瞬态状态消息脱离文档流]');

await test('widget 状态消息 absolute 定位，显隐不参与换行', () => {
  const status = byId('widget-toggle-status');
  assert.ok(status, 'widget-toggle-status 必须存在');
  const cs = window.getComputedStyle(status);
  assert.strictEqual(cs.position, 'absolute', '状态消息应 absolute 定位，脱离文档流');
});

await test('语言按钮在状态显隐时仍在导航流中（作为对照）', () => {
  const langBtn = byId('language-toggle-btn');
  assert.ok(langBtn);
  const cs = window.getComputedStyle(langBtn);
  assert.strictEqual(cs.position, 'static', '语言按钮本身保持常规流');
});

// ---------------------------------------------------------------------------
console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

fs.rmSync(outfile, { force: true });
if (failed > 0) process.exitCode = 1;
