/**
 * popup 主题切换回归（jsdom）
 *
 * 守护「主页标题栏的主题按钮在引擎未配置时也能切换」：主题是全局配置，
 * 切换结果写入共享存储（interfaceTheme），已打开的网页悬浮窗由存储变更监听跟随。
 * 与 language-toggle 同级，绑定独立于引擎配置状态（index.ts 未配置时会提前 return）。
 *
 * 运行：node test/theme-toggle.smoke.mjs
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

const popupHtml = fs.readFileSync(resolve(__dirname, '../public/popup.html'), 'utf8');

// ---------------------------------------------------------------------------
// jsdom + chrome 桩（预置暗色主题，验证打开主页时能回显存储中的主题）
// ---------------------------------------------------------------------------

const store = { interfaceTheme: 'dark' };

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

const outfile = resolve(__dirname, '.theme-toggle.bundle.mjs');
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
const iconHref = () => byId('theme-toggle-btn').querySelector('use').getAttribute('href');

console.log('\n[未配置状态：主题按钮独立于引擎配置可用]');

await test('主题切换按钮存在于标题栏', () => {
  const btn = byId('theme-toggle-btn');
  assert.ok(btn, 'theme-toggle-btn 必须存在');
  assert.ok(btn.closest('.app-titlebar-actions'), '应位于标题栏操作区');
});

await test('存储为 dark 时打开主页即应用暗色（太阳图标）', () => {
  assert.ok(document.body.classList.contains('dark-theme'), 'body 应有 dark-theme 类');
  assert.strictEqual(iconHref(), '#icon-sun', '暗色应显示太阳图标');
});

await test('点击切回亮色：类移除、图标变月亮、存储落盘', async () => {
  byId('theme-toggle-btn').click();
  await tick();
  assert.ok(!document.body.classList.contains('dark-theme'), '亮色时不应有 dark-theme 类');
  assert.strictEqual(iconHref(), '#icon-moon', '亮色应显示月亮图标');
  assert.strictEqual(store.interfaceTheme, 'light', '应已持久化 light');
});

await test('再点击切到暗色：类加回、存储落盘', async () => {
  byId('theme-toggle-btn').click();
  await tick();
  assert.ok(document.body.classList.contains('dark-theme'), '应有 dark-theme 类');
  assert.strictEqual(iconHref(), '#icon-sun');
  assert.strictEqual(store.interfaceTheme, 'dark', '应已持久化 dark');
});

// ---------------------------------------------------------------------------
console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

fs.rmSync(outfile, { force: true });
if (failed > 0) process.exitCode = 1;
