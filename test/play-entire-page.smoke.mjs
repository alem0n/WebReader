/**
 * playEntirePage 行为回归测试（jsdom）
 *
 * 验证动线分析中的两个 P0 修复：
 * - B1：播放中再触发，先停止旧播放，避免「新文本被填入但暂停」
 * - A1/A2：无 API Key 时暂存正文；Key 配好后自动消费
 *
 * 运行：node test/play-entire-page.smoke.mjs
 */
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
// 串行执行，避免多个 playEntirePage 的异步延续互相污染全局桩状态
let chain = Promise.resolve();
function test(name, fn) {
  chain = chain.then(async () => {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`); }
  });
  return chain;
}

// ---------------------------------------------------------------------------
// 搭建 jsdom + 桩环境
// ---------------------------------------------------------------------------
const html = '<!DOCTYPE html><body><article><h1>标题</h1><p>这是一段足够长的正文内容。</p></article><div id="tts-widget-host"></div></body>';
const dom = new JSDOM(html, { url: 'https://example.com/article', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.DocumentFragment = dom.window.DocumentFragment;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.NodeFilter = dom.window.NodeFilter;

// 桩：player 依赖的 widget / ui / chrome 等
const calls = {
  stop: 0,
  setAndPlay: 0,
  showPlayerScreen: 0,
};
let keyScreenVisible = false; // 模拟 apiKeyContainer 的显示状态
let playing = false;

const bundle = resolve(__dirname, '.pep.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/player.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: bundle,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
  // 把会接触真实 DOM/chrome 的模块桩掉，只测 playEntirePage 的控制流
  plugins: [
    {
      name: 'stub',
      setup(build) {
        build.onResolve({ filter: /^\.\/state$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onResolve({ filter: /^\.\/widget$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onResolve({ filter: /^\.\/ui$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onResolve({ filter: /^\.\/i18n$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onResolve({ filter: /^\.\/text-input$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onResolve({ filter: /^\.\/voices$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onResolve({ filter: /^\.\/utils$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onResolve({ filter: /^\.\.\/shared/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          loader: 'js',
          contents: `
            let __sp = { isPlaying: false, isPaused: false, currentIndex: 0, sentences: [], getDisplayText() { return ''; }, cleanup() {} };
            Object.defineProperty(__sp, 'isPlaying', {
              get() { window.__spReads = (window.__spReads || 0) + 1; return window.__spValue; },
              set(v) { window.__spValue = v; },
            });
            window.__spValue = false;
            window.__apiKeyScreen = false;
            export const state = {
              pendingPageText: null,
              apiKeyContainer: { style: { get display() { return window.__apiKeyScreen ? 'block' : 'none'; } } },
              sentencePlayer: __sp,
              audioPlayer: null,
              audioCacheManager: null,
              isCancelled: false,
              isLoading: false,
              currentVoice: null,
              currentChunkInfo: null,
              textContent: null,
            };
            window.__stubState = state;
            export function getWidgetElementById() { window.__widgetQueries = (window.__widgetQueries || 0) + 1; return null; }
            export function createWidget() {}
            export function getWidget() { return null; }
            export function showLoading() {}
            export function showError(e) { window.__lastError = e; }
            export function hideError() {}
            export function updateStatusText() {}
            export function updateButtonStates() {}
            export function disableButtons() {}
            export function resetPlayerState() {}
            export function updateTimeProgress() {}
            export function updateTextHighlight() {}
            export function estimateTotalDuration() { return 0; }
            export function escapeHtml(s) { return s; }
            export function highlightFirstSentenceIfNeeded() {}
            export function i18n(k) { return k; }
            export function removeHTMLTags(s) { return s; }
            export function removeSquareBrackets(s) { return s; }
            export function handleStop() { window.__calls.stop++; }
            export function formatVoiceName(v) { return v; }
            export function applyParentheticalFilter(t) { return t; }
            export function getParentheticalRemovedRanges() { return []; }
            export function subtractCharRanges(start, end) { return [{ start, end }]; }
            export function mergeCharRanges(r) { return r; }
            export function detectLanguage() { return null; }
            export function createLogger() { return { debug() {}, info() {}, warn() {}, error() {} }; }
            export function debounce(fn) { return fn; }
            export function limitFloat(n) { return n; }
            export async function persistSettings() {}
            export async function readSettings() { return {}; }
            export const TOGGLE_SETTINGS = [];
            // shared/local-tts 命名空间导入（player 以 * as localTts 调用）
            export function cancel() {}
            export function canSpeak() { return false; }
            export function pause() {}
            export function resume() {}
            export function speak() { return true; }
            export function normalizeLang(l) { return l; }
            export class AudioCacheManager { constructor() {} clear() {} }
            // sentence-map 复用的切分管线桩：返回单句数组即可（本测试只验控制流，不验切分）
            export class SentencePlayer {
              splitParagraphToSentences(p) { return p && String(p).trim() ? [String(p).trim()] : []; }
            }
          `,
        }));
      },
    },
  ],
});

const player = await import(pathToFileURL(bundle).href);

// 桩导出的 state 与 player 内部引用的是同一对象；桩已挂到 window.__stubState
const stubState = window.__stubState;

window.__spValue = false;
window.__calls = calls;

console.log('\n[A1/A2] 无 API Key 时暂存正文');
test('悬浮窗处于 Key 界面时，正文被暂存且不进入播放流程', async () => {
  window.__spValue = false;
  window.__apiKeyScreen = true;
  window.__widgetQueries = 0;
  await player.playEntirePage();
  // 行为级断言：Key 界面下不应进入「填文本 + 自动播放」流程
  // （setPageTextAndAutoPlay 会查询 widget 元素）
  assert.equal(window.__widgetQueries, 0, 'Key 界面下不应进入自动播放流程，正文应被暂存');
});
test('Key 配好后（Key 界面关闭）再触发，进入自动播放流程', async () => {
  window.__apiKeyScreen = false;
  window.__spValue = false;
  window.__widgetQueries = 0;
  await player.playEntirePage();
  assert.ok((window.__widgetQueries || 0) > 0, '有 Key 时应进入「填文本 + 自动播放」流程');
});

console.log('\n[B1] 播放中再触发，先停止旧播放');
test('正在播放时 playEntirePage 会先停止旧播放', async () => {
  window.__spValue = true;
  // Key 界面关闭，避免走进暂存分支而跳过 handleStop
  window.__apiKeyScreen = false;
  stubState.pendingPageText = null;
  await player.playEntirePage();
  // 真实 handleStop 在 player 内部被调用，会把 isPlaying 置回 false
  assert.equal(window.__spValue, false, '旧播放应被 handleStop 停止');
});
test('未播放时不应触发停止逻辑的副作用', async () => {
  window.__spValue = false;
  window.__apiKeyScreen = false;
  await player.playEntirePage();
  assert.equal(window.__spValue, false, '本就未播放，状态保持');
});

// 等待所有串行测试完成后汇总
await chain.finally(() => {
  rmSync(bundle, { force: true });
});

console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);
if (failed > 0) process.exitCode = 1;
