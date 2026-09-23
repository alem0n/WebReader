/**
 * popup 配置面板行为测试（jsdom + 打包产物）
 *
 * 加载真实打包产物 dist/popup.js，在 jsdom 中验证：
 *  1. DOMContentLoaded 后顶部按钮可切换面板
 *  2. 点击「后端中转」tab → relay-section 显示 / mimo-section 隐藏
 *  3. 点击「MiMo 直连」tab 切回 → mimo-section 显示 / relay-section 隐藏
 *  4. 切换引擎触发 provider 落盘（mock chrome.storage）
 *
 * 运行：node test/config-panel.behavior.mjs
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const popupHtml = fs.readFileSync(path.resolve(__dirname, '../public/popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.resolve(__dirname, '../dist/popup.js'), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`); }
}

// --- mock chrome.storage.local + chrome.runtime 消息 ---
const store = {};
const sendToTabSpies = [];
const runtimeMessageHandler = [];
const chromeStub = {
  storage: {
    local: {
      get(keys, cb) {
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (store[k] !== undefined) out[k] = store[k]; });
        // 源码多处用回调风格（readSettings / readTtsProvider），两种都要支持
        if (typeof cb === 'function') cb(out);
        return Promise.resolve(out);
      },
      set(obj, cb) {
        Object.assign(store, obj);
        // 源码用回调风格（MV3 storage.local.set 兼容回调与 Promise），两种都要支持
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      },
    },
  },
  runtime: {
    getURL(p) { return 'chrome-extension://test/' + p; },
    id: 'test-extension-id',
    onMessage: { addListener: (fn) => runtimeMessageHandler.push(fn) },
    sendMessage: (msg, ...rest) => {
      // popup → background 的消息在此被 stub 接管
      const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : null;
      // relay 相关配置：返回「未配置」以走面板展开分支
      if (msg.action === 'checkApiKeyStatus') return cb && cb({ hasKey: false });
      if (msg.action === 'checkRelayStatus') return cb && cb({ success: false, url: '' });
      if (msg.action === 'switchProvider') { store['tts_provider'] = msg.provider; return cb && cb({ success: true }); }
      return cb && cb({});
    },
  },
  tabs: { query: () => Promise.resolve([{ id: 1 }]), sendMessage: (tid, msg) => { sendToTabSpies.push(msg); return Promise.resolve(); } },
  i18n: { getMessage: () => '' },
};

const dom = new JSDOM(popupHtml, {
  url: 'chrome-extension://test/popup.html',
  runScripts: 'outside-only',
});
const { window } = dom;

// 注入全局
globalThis.window = window;
globalThis.document = window.document;
globalThis.chrome = chromeStub;
window.chrome = chromeStub;

// 执行打包产物（IIFE，绑定 DOMContentLoaded）
window.eval(popupJs);

// 工具
const byId = (id) => window.document.getElementById(id);
const isHidden = (el) => !el || el.classList.contains('hidden');
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

await tick(120); // 等 DOMContentLoaded 异步初始化完成

console.log('\n[popup 配置面板 · 行为]');

test('顶部「配置 / 切换」按钮可切换面板显隐', () => {
  const panel = byId('config-panel');
  const btn = byId('config-toggle-panel');
  assert.ok(btn, 'config-toggle-panel 必须存在');
  // 未配置时面板默认展开引导配置（设计意图），以初始态为基准验证「点击即翻转」
  const initialOpen = !isHidden(panel);
  btn.click();
  assert.notStrictEqual(!isHidden(panel), initialOpen, '第一次点击后显隐状态应翻转');
  btn.click();
  assert.strictEqual(!isHidden(panel), initialOpen, '第二次点击后应回到初始状态');
  // 恢复展开态供后续用例
  if (isHidden(panel)) btn.click();
});

test('点击「后端中转」tab：relay-section 显示 / mimo-section 隐藏', () => {
  byId('config-panel').classList.remove('hidden');
  byId('engine-tab-relay').click();
  assert.ok(!isHidden(byId('relay-section')), 'relay-section 应显示');
  assert.ok(isHidden(byId('mimo-section')), 'mimo-section 应隐藏');
  assert.strictEqual(byId('engine-tab-relay').getAttribute('aria-selected'), 'true');
  assert.strictEqual(byId('engine-tab-mimo').getAttribute('aria-selected'), 'false');
});

test('切换引擎落盘 provider 到 chrome.storage.local', () => {
  assert.strictEqual(store['tts_provider'], 'relay', 'provider 应为 relay');
});

test('点击「MiMo 直连」tab：切回 mimo-section 显示', async () => {
  byId('engine-tab-mimo').click();
  await tick(80);
  assert.ok(!isHidden(byId('mimo-section')), 'mimo-section 应显示');
  assert.ok(isHidden(byId('relay-section')), 'relay-section 应隐藏');
  assert.strictEqual(store['tts_provider'], 'mimo', 'provider 应回落盘为 mimo');
});

test('后端中转区：空地址点保存报错', () => {
  byId('config-panel').classList.remove('hidden');
  byId('engine-tab-relay').click();
  const err = byId('relay-error');
  err.classList.add('hidden');
  byId('relay-save-btn').click();
  assert.ok(!isHidden(err), '应展示「请输入后端地址」');
  assert.ok(err.textContent.includes('后端地址'), '错误文案应提示后端地址');
});

console.log(`\n${failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
