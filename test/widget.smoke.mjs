/**
 * widget 创建冒烟测试：Shadow DOM 挂载、结构完整性、幂等与初始化钩子。
 *
 * 覆盖 docs/tech-debt.md TD-001 拆分后的装配链路（icons + template + styles + 挂载）。
 * widget 依赖 chrome.runtime / chrome.storage，用最小桩提供「未配置」响应，
 * i18n 回退为键名，足以做结构断言。
 */
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));

const html = '<!DOCTYPE html><body><p>正文</p></body>';
const dom = new JSDOM(html, { url: 'https://example.com/article', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.DocumentFragment = dom.window.DocumentFragment;
globalThis.ShadowRoot = dom.window.ShadowRoot;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.localStorage = dom.window.localStorage;

// 最小 chrome 桩：storage 无配置，runtime 返回失败让 i18n 回退到键名
let lastMsg = null;
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => cb && cb(),
    },
  },
  runtime: {
    sendMessage: (msg, cb) => {
      lastMsg = msg;
      cb({ success: false });
    },
    lastError: null,
  },
  i18n: { getMessage: (key) => null },
};

const bundle = resolve(__dirname, '.widget.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/widget/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: bundle,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});
const widget = await import(pathToFileURL(bundle).href);

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

await widget.createWidget();

const host = () => document.getElementById('tts-widget-host');
const root = () => host()?.shadowRoot;
const el = (id) => root()?.getElementById(id);

console.log('\n[Shadow DOM 挂载]');
await test('宿主 #tts-widget-host 已创建', () => {
  assert.ok(host(), '宿主应存在');
});
await test('Shadow DOM 已挂载且含 #edge-tts-widget', () => {
  assert.ok(root(), '应有 shadowRoot');
  assert.ok(root().getElementById('edge-tts-widget'), '应有悬浮窗根元素');
});
await test('getWidget() 返回 Shadow DOM 内的悬浮窗', () => {
  const w = widget.getWidget();
  assert.ok(w);
  assert.equal(w.id, 'edge-tts-widget');
});
await test('getWidgetElementById 在 Shadow DOM 内取元素', () => {
  const btn = widget.getWidgetElementById('play-pause-btn');
  assert.ok(btn, 'play-pause-btn 应存在');
  assert.equal(btn.tagName, 'BUTTON');
  // 初始未加载音色，播放控制应禁用
  assert.ok(btn.disabled, 'play-pause-btn 初始应禁用');
});
await test('未创建时 getWidget 返回 null（ detach 后）', () => {
  host().remove();
  assert.equal(widget.getWidget(), null);
  assert.equal(widget.getWidgetElementById('play-pause-btn'), null);
  widget.createWidget(); // 重建供后续用例
});

console.log('\n[结构完整性]');
await test('样式已注入 Shadow DOM', () => {
  const style = root().querySelector('style');
  assert.ok(style, '应有 style 元素');
  assert.ok(style.textContent.includes('#edge-tts-widget'), '样式应含悬浮窗根选择器');
  assert.ok(style.textContent.includes('.dark-theme'), '样式应含暗色主题变体');
});
await test('SVG 图标精灵已注入（UI 图标 + 国旗方块）', () => {
  const symbols = root().querySelectorAll('symbol');
  assert.ok(symbols.length >= 20, `symbol 数应 >= 20，实际 ${symbols.length}`);
  assert.ok(root().querySelector('#icon-play'), '应有 icon-play');
  assert.ok(root().querySelector('#flag-en-square'), '应有 flag-en-square');
});
await test('头部 + 语言切换结构完整', () => {
  assert.ok(el('tts-widget-header'), '应有头部');
  assert.ok(el('language-button'), '应有语言按钮');
  assert.ok(el('language-select'), '应有原生语言下拉');
  assert.ok(el('tts-widget-minimize') && el('tts-widget-theme-toggle') && el('tts-widget-close'), '应有最小化/主题/关闭按钮');
});
await test('音色面板结构完整（搜索 + 语速 + 开关容器）', () => {
  assert.ok(el('voice-search'), '应有音色搜索框');
  assert.ok(el('voice-search-clear'), '应有清除按钮');
  assert.ok(el('voice-dropdown'), '应有音色下拉');
  assert.ok(el('speed-select'), '应有语速下拉');
  assert.ok(el('voice-panel-toggle'), '应有面板折叠按钮');
  assert.ok(el('toggle-settings-column'), '应有开关容器（数据驱动渲染的挂载点）');
});
await test('API Key 提示界面与播放器容器并存', () => {
  assert.ok(el('apikey-container'), '应有 API Key 容器');
  assert.ok(el('player-container'), '应有播放器容器');
  assert.ok(el('text-content'), '应有文本显示区');
});
await test('播放控制五按钮齐备（上一句/播放/下一句/停止/清除）', () => {
  for (const id of ['prev-btn', 'play-pause-btn', 'next-btn', 'stop-btn', 'clear-btn']) {
    assert.ok(el(id), `应有 ${id}`);
  }
});
await test('状态栏 / 错误区 / 音频元素齐备', () => {
  assert.ok(el('status-text'), '应有状态文本');
  assert.ok(el('time-progress'), '应有时间进度');
  assert.ok(el('error-message'), '应有错误区');
  assert.ok(el('audio-player'), '应有音频元素');
});

console.log('\n[幂等与钩子]');
await test('重复 createWidget 不产生重复宿主', async () => {
  await widget.createWidget();
  await widget.createWidget();
  assert.equal(document.querySelectorAll('#tts-widget-host').length, 1, '宿主应只有一个');
});
await test('setWidgetInitializer 钩子在挂载后被调用', async () => {
  let calledWith = null;
  widget.setWidgetInitializer((w) => {
    calledWith = w;
  });
  host().remove();
  await widget.createWidget();
  assert.ok(calledWith, '初始化钩子应被调用');
  assert.equal(calledWith.id, 'edge-tts-widget', '钩子收到的是悬浮窗根元素');
});
await test('i18n 未配置时回退为键名（界面仍可渲染）', () => {
  assert.ok(lastMsg && lastMsg.action === 'loadI18nMessages', '应请求加载 i18n 消息');
  // 标题回退为键名而非空串，保证按钮可用
  const btn = el('play-pause-btn');
  assert.ok(btn.title && btn.title.length > 0, '按钮 title 不应为空');
});

import { rmSync } from 'node:fs';
rmSync(bundle, { force: true });

console.log('\n=================================');
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);
if (failed > 0) process.exitCode = 1;
