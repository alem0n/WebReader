/**
 * popup 音色下拉备选列表回归（jsdom）
 *
 * 守护「主页音色搜索框聚焦 / 点击时下拉展示完整备选列表」。
 *
 * 修复前：focus / click 处理器拿 voiceSearchInput.value 当搜索词调 filterVoices，
 * 但输入框里显示的是「已选音色的显示名」（默认派生为 "en-US - Mia"，恢复手选时为
 * 原始名），而 filterVoices 只按 name / language / gender 匹配 —— 按显示名过滤得到
 * 0 条（下拉看不到任何备选），按原始名过滤得到 1 条（只能选到当前音色本身）。
 * 修复后聚焦 / 点击一律 filterVoices('') 展示全部备选，只有用户键入的文本才过滤。
 *
 * 运行：node test/voice-dropdown.smoke.mjs
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

function inlineCss(html) {
  return html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (m, href) => {
    const css = fs.readFileSync(resolve(__dirname, '../public', href), 'utf8');
    return `<style>\n${css}\n</style>`;
  });
}

const popupHtml = inlineCss(fs.readFileSync(resolve(__dirname, '../public/popup.html'), 'utf8'));

// 与 src/shared/constants.ts 的 MIMO_PRESET_VOICES 保持一致（9 个预置音色）
const PRESET_VOICES = [
  { name: 'MiMo-默认', voice: 'mimo_default', language: 'zh-CN' },
  { name: '冰糖', voice: '冰糖', language: 'zh-CN' },
  { name: '茉莉', voice: '茉莉', language: 'zh-CN' },
  { name: '苏打', voice: '苏打', language: 'zh-CN' },
  { name: '白桦', voice: '白桦', language: 'zh-CN' },
  { name: 'Mia', voice: 'Mia', language: 'en-US' },
  { name: 'Chloe', voice: 'Chloe', language: 'en-US' },
  { name: 'Milo', voice: 'Milo', language: 'en-US' },
  { name: 'Dean', voice: 'Dean', language: 'en-US' },
];

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
      if (action === 'checkApiKeyStatus') return cb({ success: true, hasKey: true, maskedKey: 'sk-***1234' });
      if (action === 'checkRelayStatus') return cb({ success: false });
      if (action === 'getPresetVoices') return cb({ success: true, voices: PRESET_VOICES });
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

const outfile = resolve(__dirname, '.voice-dropdown.bundle.mjs');
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
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

const tick = () => new Promise((r) => setTimeout(r, 60));
// 音色加载含最多 3 次重试的 await 链，多给几拍
for (let i = 0; i < 8; i++) await tick();

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
const optionCount = () => byId('voice-dropdown').querySelectorAll('.voice-option').length;
const dropdownVisible = () => !byId('voice-dropdown').classList.contains('hidden');

console.log('\n[主页音色下拉备选列表]');

await test('音色已加载（前置条件）', () => {
  assert.strictEqual(optionCount() > 0, true, '下拉应已渲染音色选项');
});

await test('加载后下拉默认收起', () => {
  assert.strictEqual(dropdownVisible(), false, '未交互前下拉应隐藏');
});

await test('聚焦搜索框展开下拉且列出全部备选（核心回归点）', () => {
  byId('voice-search').dispatchEvent(new window.FocusEvent('focus'));
  assert.strictEqual(dropdownVisible(), true, '聚焦后下拉应展开');
  assert.strictEqual(optionCount(), 9, '应展示全部 9 个备选音色，而不是被输入框显示名过滤掉');
});

await test('收起后点击搜索框仍展开全部备选', () => {
  document.body.click(); // 点击外部收起
  assert.strictEqual(dropdownVisible(), false, '点击外部应收起');
  byId('voice-search').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(dropdownVisible(), true, '点击后下拉应展开');
  assert.strictEqual(optionCount(), 9, '点击同样应展示全部 9 个备选');
});

await test('用户真正键入时按输入文本过滤', () => {
  const input = byId('voice-search');
  input.value = 'zh';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(optionCount(), 5, '键入 zh 应过滤出 5 个中文音色');
  input.value = '';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

await test('搜「中文」过滤出中文音色（核心回归点）', () => {
  const input = byId('voice-search');
  input.value = '中文';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(optionCount(), 5, '中文应命中 5 个 zh-CN 音色');
  input.value = '';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

await test('搜「英文 / 英语」过滤出英文音色（同理）', () => {
  const input = byId('voice-search');
  for (const q of ['英文', '英语']) {
    input.value = q;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.strictEqual(optionCount(), 4, `键入 ${q} 应过滤出 4 个英文音色`);
  }
  input.value = '';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

await test('英文界面用 Chinese / English 也能过滤（双向兼容）', () => {
  const input = byId('voice-search');
  input.value = 'Chinese';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(optionCount(), 5, 'Chinese 应命中 5 个中文音色');
  input.value = 'English';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(optionCount(), 4, 'English 应命中 4 个英文音色');
  input.value = '';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

await test('键入后重新聚焦回到完整备选列表', () => {
  const input = byId('voice-search');
  input.value = 'en';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(optionCount(), 4, '键入 en 应过滤出 4 个英文音色');
  input.dispatchEvent(new window.FocusEvent('focus'));
  assert.strictEqual(optionCount(), 9, '重新聚焦应回到完整备选列表');
});

await test('点选某个音色后下拉收起，再次聚焦仍展示全部备选', () => {
  const dropdown = byId('voice-dropdown');
  const first = dropdown.querySelector('.voice-option');
  first.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(dropdownVisible(), false, '选中后下拉应收起');
  assert.ok(byId('voice-search').value, '选中后搜索框应有已选音色显示名');
  byId('voice-search').dispatchEvent(new window.FocusEvent('focus'));
  assert.strictEqual(optionCount(), 9, '已选状态下再次聚焦仍应展示全部备选');
});

// ---------------------------------------------------------------------------
console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

fs.rmSync(outfile, { force: true });
if (failed > 0) process.exitCode = 1;
