/**
 * 点击跳转集成测试：真实模块跑「整页朗读中点击句子 span → 跳到该句播放」。
 *
 * 验证音色单一来源设计的两条不变式（docs/adr/0002）：
 *  1. jumpToSentence 直接复用 state.selectedVoice，不重新派生；
 *  2. 未手选时由 ensureVoiceSelected 按界面语言派生默认音色并落实进
 *     selectedVoice（含无匹配语种回退），派生不标记手选；手选优先于派生。
 *
 * 真实模块：state / reading-overlay / sentence-map / player/* / page-listeners /
 * shared/voice-default（纯函数，不桩）；桩：ui / widget / i18n / text-input /
 * voices / settings / selection 与其余 chrome 依赖的 shared。
 *
 * 注意：覆盖层（reading-overlay）在句子变化时会重绘 span，点击必须查活 DOM；
 * 桩的 debounce 不做延时应直接放行，故 jumpToSentence 后立即断言同步部分，
 * 再等待微任务跑完播放链路。
 */
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as assert from 'node:assert';
import { rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const norm = (p) => p.split('\\').join('/');

const html = `<!DOCTYPE html><body>
  <article>
    <p id="p1">这是第一段。这是第一段的第二句！</p>
    <p id="p2">Second paragraph here. Another sentence.</p>
    <p id="p3">混合（括号内容不应朗读）的正文。</p>
  </article>
</body>`;
const dom = new JSDOM(html, { url: 'https://example.com/article', pretendToBeVisual: true });
// 保留 Node 原生 Blob：假 ensure 返回它才能被 Node 的 URL.createObjectURL 接受
// （jsdom 的 Blob 会被 Node 的 createObjectURL 拒绝，进而误入容灾分支）
const NodeBlob = globalThis.Blob;
for (const g of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'ShadowRoot', 'MouseEvent', 'getComputedStyle', 'NodeFilter', 'localStorage', 'Blob']) {
  globalThis[g] = dom.window[g];
}
globalThis.chrome = {
  storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } },
  runtime: { sendMessage: (m, cb) => cb({ success: false }), lastError: null },
  i18n: { getMessage: () => null },
};

const bundle = resolve(__dirname, '.clickjump.bundle.mjs');
const entry = norm(resolve(__dirname, '../src/content/page-listeners.ts'));
const statePath = norm(resolve(__dirname, '../src/content/state.ts'));
const voiceSelPath = norm(resolve(__dirname, '../src/content/voices/voice-selection.ts'));
const voiceDefaultPath = norm(resolve(__dirname, '../src/shared/voice-default.ts'));
await esbuild.build({
  stdin: {
    contents: [
      `export { registerClickJumpListener, registerSelectionListener } from '${entry}';`,
      `export { state } from '${statePath}';`,
      `export { ensureVoiceSelected } from '${voiceSelPath}';`,
    ].join('\n'),
    resolveDir: __dirname,
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: bundle,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
  plugins: [
    {
      name: 'stub',
      setup(build) {
        // 纯领域模块不桩，验证真实的「界面语言 → 默认音色」派生与兜底
        build.onResolve({ filter: /voice-default$/ }, () => ({ path: voiceDefaultPath }));
        for (const m of ['ui', 'widget', 'i18n', 'text-input', 'voices', 'settings', 'selection']) {
          build.onResolve({ filter: new RegExp(`^\\.\\.?\\/${m}$`) }, (a) => ({ path: a.path, namespace: 'stub' }));
        }
        build.onResolve({ filter: /^(\.\.\/)+shared/ }, (a) => ({ path: a.path, namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          loader: 'js',
          contents: `
            export const state = {};
            export function getWidgetElementById() { return null; }
            export function createWidget() {}
            export function getWidget() { return null; }
            export function showError(e) { globalThis.__lastError = e; }
            export function hideError() {}
            export function showLoading() {}
            export function updateStatusText() {}
            export function updateButtonStates() {}
            export function updateTextHighlight(i) { globalThis.__hl = i; }
            export function disableButtons() {}
            export function resetPlayerState() {}
            export function updateTimeProgress() {}
            export function estimateTotalDuration() { return 0; }
            export function setupDisabledTooltips() {}
            export function updateClearButton() {}
            export function highlightFirstSentenceIfNeeded() {}
            export function setVoicePanelCollapsed() {}
            export function escapeHtml(s) { return s; }
            export function getParentheticalRemovedRanges() { return []; }
            export function subtractCharRanges(start, end) { return [{ start, end }]; }
            export function mergeCharRanges(r) { return r; }
            export function i18n(k) { return k; }
            export function getFlagIdForLocale() { return ''; }
            export function getTranslatedCountry() { return ''; }
            export function getTranslatedGender() { return ''; }
            export function getTranslatedLanguageName() { return ''; }
            export const languageNames = {};
            export function removeHTMLTags(s) { return s; }
            export function removeSquareBrackets(s) { return s; }
            export function formatVoiceName(v) { return v && v.name ? v.name : v; }
            export function reloadToggleSettings() {}
            export async function readTtsProvider() { return 'mimo'; }
            export function handleTextSelection() {}
            export function createLogger() { return { debug() {}, info() {}, warn() {}, error() {} }; }
            export function debounce(fn) { return fn; }
            export function limitFloat(n) { return n; }
            export async function persistSettings() {}
            export async function readSettings() { return {}; }
            export const TOGGLE_SETTINGS = [];
            export function cancel() {}
            export function canSpeak() { return false; }
            export function pause() {}
            export function resume() {}
            export function speak() { return true; }
            export function normalizeLang(l) { return l; }
            export function applyParentheticalFilter(t) { return t; }
            export function collectPageForReading() { return { units: [], map: { sentences: [], ranges: [], ownerIndex: [] } }; }
            export function getDisplayTextFromMap() { return ''; }
            export function prepareReadingOverlay() {}
            export function highlightSentence() {}
            export function clearReadingOverlay() {}
            export function resolveClickJumpTarget() { return null; }
            export function extractPageText() { return ''; }
            export class AudioCacheManager { constructor() {} clear() {} stop() {} start() {} }
            export class SentencePlayer {
              constructor() { this.sentences = []; this.currentIndex = 0; this.isPlaying = false; this.isPaused = false; }
              setText(t) { this.sentences = String(t || '').split('。').filter(Boolean); }
              setSentences(s) { this.sentences = s; }
              addAudioUrl() {}
              cleanup() {}
              reset() { this.currentIndex = 0; }
              getDisplayText() { return this.sentences.join(''); }
            }
          `,
        }));
      },
    },
  ],
});

const mod = await import(pathToFileURL(bundle).href);
const { state, ensureVoiceSelected } = mod;

// 真实的句子映射（独立打包 sentence-map，无桩，保证 map 与 DOM 一致）
const smBundle = resolve(__dirname, '.clickjump-smap.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/sentence-map.ts')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  outfile: smBundle, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});
const sm = await import(pathToFileURL(smBundle).href);
const units = [
  { element: document.getElementById('p1'), text: '这是第一段。这是第一段的第二句！' },
  { element: document.getElementById('p2'), text: 'Second paragraph here. Another sentence.' },
  { element: document.getElementById('p3'), text: '混合（括号内容不应朗读）的正文。' },
];
const map = sm.buildSentenceMap(units, units.map((u) => u.text));

// 四个音色：中文 / 英文 / 日文（无中英匹配）/ 双语默认，用于分辨派生命中与兜底
const ZH = { name: 'zh-female', voice: 'zh_female', language: 'zh-CN', gender: 'Female' };
const EN = { name: 'en-male', voice: 'en_male', language: 'en-US', gender: 'Male' };
const JA = { name: 'ja-female', voice: 'ja_female', language: 'ja-JP', gender: 'Female' };
const DEFAULT = { name: 'mimo_default', voice: 'mimo_default', language: 'zh-CN', gender: 'Female' };

// 装配整页朗读中的真实 state
state.pageTextUnits = units;
state.pageTextMap = map;
state.inlineDisplayEnabled = true;
state.autoScrollEnabled = true;
state.voiceSelectionIsManual = false;
state.interfaceLanguage = 'zh_CN';
state.selectedVoice = null;
state.playbackSpeed = 1;
state.currentPlayRequestId = 0;
state.navigationRequestId = 0;
state.isCancelled = false;
state.localFallbackActive = false;
state.totalElapsedTime = 0;
state.currentChunkStartTime = 0;
state.currentVoice = null;
state.currentChunkInfo = null;
state.allVoices = [ZH, EN, JA, DEFAULT];
state.textContent = { textContent: map.sentences.join(' '), innerText: map.sentences.join(' ') };
state.sentencePlayer = {
  sentences: map.sentences,
  currentIndex: 0,
  isPlaying: true,
  isPaused: false,
  setSentences() {}, setText() {}, addAudioUrl() {}, cleanup() {}, reset() {},
  getDisplayText() { return map.sentences.join(' '); },
};
const cacheCalls = [];
state.audioCacheManager = {
  ensure: async (i) => { cacheCalls.push(['ensure', i]); return new NodeBlob(['x']); },
  setCurrentIndex: (i) => cacheCalls.push(['setCurrentIndex', i]),
  clear: () => {}, stop: () => {}, start: () => {},
};
state.audioPlayer = {
  src: '', paused: false, currentTime: 0, duration: 1,
  play: async () => {}, pause() {}, addEventListener() {}, removeEventListener() {}, removeAttribute() {}, load() {},
};
state.voiceSearchInput = { value: '' };
state.toggleCheckboxes = {};

// 注册监听并用真实 reading-overlay 包裹句子 span
mod.registerClickJumpListener();
const roBundle = resolve(__dirname, '.clickjump-ro.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/content/reading-overlay.ts')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  outfile: roBundle, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});
const ro = await import(pathToFileURL(roBundle).href);
ro.prepareReadingOverlay(units, map);
console.log('句子数:', map.sentences.length, '生成的 span 数:', document.querySelectorAll('span.tts-reading-sentence').length);

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function clickSpan(index) {
  // 覆盖层在句子变化时重绘 span，必须查活 DOM，否则点到已脱离文档的旧节点
  const span = document.querySelector(`span.tts-reading-sentence[data-tts-sentence="${index}"]`);
  if (!span) throw new Error(`span ${index} 不存在`);
  span.dispatchEvent(new dom.window.MouseEvent('mousedown', { clientX: 5, clientY: 5, bubbles: true }));
  span.dispatchEvent(new dom.window.MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true }));
}

console.log('\n[手选模式：跳转直接复用已选音色，界面语言不覆盖]');
state.voiceSelectionIsManual = true;
state.selectedVoice = ZH;
state.interfaceLanguage = 'en'; // 若跳转重新派生，就会切到英文音色

await test('点击后立即移动到目标句', () => {
  clickSpan(2);
  assert.equal(state.sentencePlayer.currentIndex, 2);
});
await test('防抖后播放，且用的是已选音色（未重新派生）', async () => {
  await wait(300);
  assert.ok(cacheCalls.some((c) => c[0] === 'ensure' && c[1] === 2), '应加载目标句音频');
  assert.equal(state.currentVoice, ZH, '跳转应复用 selectedVoice，而不是按界面语言切换');
});

console.log('\n[音色目录未加载：selectedVoice 为空，点击不跳转]');
state.voiceSelectionIsManual = false;
state.selectedVoice = null;
state.currentVoice = null;
state.allVoices = [];
cacheCalls.length = 0;

await test('无可用音色时点击 span 不发起播放（符合设计）', async () => {
  state.sentencePlayer.currentIndex = 0;
  clickSpan(3);
  // 下标会乐观移动，但无音色时应早退：不加载音频、不播放
  assert.equal(state.sentencePlayer.currentIndex, 3, '下标应乐观移动');
  await wait(300);
  assert.ok(!cacheCalls.some((c) => c[0] === 'ensure' && c[1] === 3), '无可用音色时不应加载音频');
  assert.equal(state.currentVoice, null, '无音色时不应开始播放');
});

console.log('\n[跟随界面语言：ensureVoiceSelected 派生默认音色，手选优先]');
state.allVoices = [ZH, EN, JA, DEFAULT];

await test('中文界面 → 派生首个中文音色并落实为单一来源', () => {
  state.interfaceLanguage = 'zh_CN';
  state.voiceSelectionIsManual = false;
  state.selectedVoice = null;
  const v = ensureVoiceSelected();
  assert.equal(v, ZH);
  assert.equal(state.selectedVoice, ZH, '应写入 selectedVoice 作为单一来源');
  assert.equal(state.voiceSelectionIsManual, false, '派生不标记手选');
  assert.ok(!!state.voiceSearchInput.value, '应同步搜索框');
});
await test('英文界面 → 派生首个英文音色', () => {
  state.interfaceLanguage = 'en';
  state.voiceSelectionIsManual = false;
  state.selectedVoice = null;
  assert.equal(ensureVoiceSelected(), EN);
});
await test('无匹配语种 → 回退双语默认音色 mimo_default', () => {
  state.interfaceLanguage = 'en';
  state.voiceSelectionIsManual = false;
  state.selectedVoice = null;
  state.allVoices = [JA, DEFAULT]; // 无英文音色
  assert.equal(ensureVoiceSelected(), DEFAULT, '无英文音色应回退 mimo_default');
  state.allVoices = [ZH, EN, JA, DEFAULT];
});
await test('音色目录为空 → 返回现状（保留 null），不崩溃', () => {
  state.allVoices = [];
  state.selectedVoice = null;
  state.voiceSelectionIsManual = false;
  assert.equal(ensureVoiceSelected(), null);
  state.allVoices = [ZH, EN, JA, DEFAULT];
});
await test('手选音色优先于界面语言派生，不被覆盖', () => {
  state.interfaceLanguage = 'en';
  state.voiceSelectionIsManual = true;
  state.selectedVoice = ZH;
  assert.equal(ensureVoiceSelected(), ZH, '手选优先，英文界面不切走中文音色');
});
await test('派生后点击跳转：直接复用落实的音色', async () => {
  state.interfaceLanguage = 'zh_CN';
  state.voiceSelectionIsManual = false;
  state.selectedVoice = null;
  ensureVoiceSelected(); // 模拟音色加载完成时的派生
  assert.equal(state.selectedVoice, ZH);
  state.sentencePlayer.currentIndex = 0;
  state.currentVoice = null;
  cacheCalls.length = 0;
  clickSpan(4);
  assert.equal(state.sentencePlayer.currentIndex, 4);
  await wait(300);
  assert.ok(cacheCalls.some((c) => c[0] === 'ensure' && c[1] === 4), '应加载目标句音频');
  assert.equal(state.currentVoice, ZH, '跳转复用派生的默认音色');
});

for (const f of ['.clickjump.bundle.mjs', '.clickjump-smap.bundle.mjs', '.clickjump-ro.bundle.mjs']) {
  rmSync(resolve(__dirname, f), { force: true });
}
console.log('\n=================================');
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log('=================================\n');
if (failed > 0) process.exitCode = 1;
