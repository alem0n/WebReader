/**
 * popup 音色下拉大目录回归（jsdom）
 *
 * 守护「后端中转（Edge）大目录下，聚焦 / 点击音色搜索框时中文音色可见」。
 *
 * 修复前：聚焦 / 点击调 filterVoices('') 全量铺开，renderVoiceDropdown 只渲染
 * slice(0, 100)。Edge 目录有几百个音色，名称形如 zh-CN-XiaoxiaoNeural，按名排序时
 * zh-* 排在字母表末段，全部中文音色落在第 100 条之外 → 下拉里一条中文都看不到
 * （「中文界面找不到中文音色」）。修复后默认视图按已选音色的语言收窄，中文界面
 * 下只列中文音色，100 条截断永远触不到。用户键入的文本仍走全量搜索。
 *
 * 与 voice-dropdown.smoke.mjs 互补：那个文件用 MiMo 的 9 个预置音色，触发不了
 * 100 条截断；本文件用代表性 Edge 语种目录（语种前缀按公开目录枚举，每语种若干
 * 音色，总量两百以上），专门覆盖大目录场景。
 *
 * 运行：node test/voice-dropdown-large.smoke.mjs
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

// 代表性 Edge 语种前缀（azure / edge-tts 公开目录枚举），zh 排在末段
const LOCALES = [
  'af-ZA', 'am-ET', 'ar-AE', 'ar-BH', 'ar-DZ', 'ar-EG', 'ar-IQ', 'ar-JO', 'ar-KW', 'ar-LY',
  'ar-MA', 'ar-QA', 'ar-SA', 'ar-SY', 'ar-TN', 'ar-YE', 'az-AZ', 'bg-BG', 'bn-BD', 'bn-IN',
  'bs-BA', 'ca-ES', 'cs-CZ', 'cy-GB', 'da-DK', 'de-AT', 'de-CH', 'de-DE', 'el-GR', 'en-AU',
  'en-CA', 'en-GB', 'en-HK', 'en-IE', 'en-IN', 'en-KE', 'en-NG', 'en-NZ', 'en-PH', 'en-SG',
  'en-TZ', 'en-US', 'en-ZA', 'es-AR', 'es-BO', 'es-CL', 'es-CO', 'es-CR', 'es-CU', 'es-DO',
  'es-EC', 'es-ES', 'es-GQ', 'es-GT', 'es-HN', 'es-MX', 'es-NI', 'es-PA', 'es-PE', 'es-PR',
  'es-PY', 'es-SV', 'es-US', 'es-UY', 'es-VE', 'et-EE', 'eu-ES', 'fa-IR', 'fi-FI', 'fil-PH',
  'fr-BE', 'fr-CA', 'fr-CH', 'fr-FR', 'ga-IE', 'gl-ES', 'gu-IN', 'he-IL', 'hi-IN', 'hr-HR',
  'hu-HU', 'hy-AM', 'id-ID', 'is-IS', 'it-IT', 'ja-JP', 'jv-ID', 'ka-GE', 'kk-KZ', 'km-KH',
  'kn-IN', 'ko-KR', 'lo-LA', 'lt-LT', 'lv-LV', 'mk-MK', 'ml-IN', 'mr-IN', 'ms-MY', 'mt-MT',
  'my-MM', 'nb-NO', 'ne-NP', 'nl-BE', 'nl-NL', 'pa-IN', 'pl-PL', 'ps-AF', 'pt-BR', 'pt-PT',
  'ro-RO', 'ru-RU', 'si-LK', 'sk-SK', 'sl-SI', 'so-SO', 'sq-AL', 'sr-RS', 'su-ID', 'sv-SE',
  'sw-KE', 'ta-IN', 'te-IN', 'th-TH', 'tr-TR', 'uk-UA', 'ur-IN', 'ur-PK', 'uz-UZ', 'vi-VN',
  'zh-CN', 'zh-HK', 'zh-TW', 'zu-ZA',
];
const PERSONS = ['Aria', 'Jenny', 'Guy', 'Davis', 'Ana', 'Maria', 'Luna', 'Enrique', 'Xiaoxiao', 'Yunyang', 'Yunxi'];

// 生成类 Edge 目录：名称 = 语种-人名Neural，每语种 1~3 个音色
const EDGE_VOICES = [];
LOCALES.forEach((locale, i) => {
  const count = 1 + (i % 3);
  for (let k = 0; k < count; k++) {
    EDGE_VOICES.push({
      name: `${locale}-${PERSONS[(i + k) % PERSONS.length]}Neural`,
      voice: locale,
      language: locale,
    });
  }
});

// 中文音色 = 语种以 zh 开头（zh-CN / zh-HK / zh-TW）；英文 = en 开头
const ZH_COUNT = EDGE_VOICES.filter((v) => v.language.startsWith('zh')).length;
const EN_COUNT = EDGE_VOICES.filter((v) => v.language.startsWith('en')).length;

const store = { interfaceLanguage: 'zh_CN' }; // 中文界面：默认音色派生为中文

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
      if (action === 'getPresetVoices') return cb({ success: true, voices: EDGE_VOICES });
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

const outfile = resolve(__dirname, '.voice-dropdown-large.bundle.mjs');
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

// 单独打 shared/voice-search：键入搜索的期望命中数必须用真实 matchVoiceSearchTerm
// 计算（跨字段子串匹配，命中数不等于某语种音色数），与实现同源
const searchBundle = resolve(__dirname, '.voice-search-large.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/shared/voice-search.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: searchBundle,
  logLevel: 'silent',
});
const { matchVoiceSearchTerm } = await import(pathToFileURL(searchBundle).href);
/** 全量目录里命中的音色数（键入搜索不受语言范围限制，跨全部语种） */
const searchMatchCount = (term) => EDGE_VOICES.filter((v) => matchVoiceSearchTerm(v, term)).length;

await import(pathToFileURL(outfile).href);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

const tick = () => new Promise((r) => setTimeout(r, 60));
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

console.log('\n[主页音色下拉 · 大目录（Edge）]');
console.log(`  目录规模：${EDGE_VOICES.length} 个音色，其中中文 ${ZH_COUNT}、英文 ${EN_COUNT}`);

await test('音色已加载（前置条件）', () => {
  byId('voice-search').dispatchEvent(new window.FocusEvent('focus'));
  assert.ok(optionCount() > 0, '下拉应已渲染音色选项');
});

await test('中文界面：聚焦下拉展示全部中文音色（核心回归点）', () => {
  byId('voice-search').dispatchEvent(new window.FocusEvent('focus'));
  assert.strictEqual(dropdownVisible(), true, '聚焦后下拉应展开');
  // 修复前：全量铺开 + slice(0,100)，中文排在 100 条之外 → 0 条可见
  assert.strictEqual(optionCount(), ZH_COUNT, `默认视图应收窄到中文音色（${ZH_COUNT} 条），而非被 100 条截断`);
});

await test('点击搜索框同样展示中文音色', () => {
  document.body.click(); // 先收起
  assert.strictEqual(dropdownVisible(), false, '点击外部应收起');
  byId('voice-search').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(dropdownVisible(), true, '点击后下拉应展开');
  assert.strictEqual(optionCount(), ZH_COUNT, '点击同样应收窄到中文音色');
});

await test('键入仍走全量搜索：跨语言匹配，期望值与实现同源（不受语言范围限制）', () => {
  const input = byId('voice-search');
  input.value = 'en';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(optionCount(), searchMatchCount('en'), '键入 en 的命中数应与全量目录搜索一致');
  input.value = '';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

await test('键入其它语言也能搜到（证明是全量目录而非仅当前语言）', () => {
  const input = byId('voice-search');
  input.value = 'ja';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  const jaCount = EDGE_VOICES.filter((v) => v.language.startsWith('ja')).length;
  assert.ok(jaCount > 0, '测试目录应含日文音色');
  assert.strictEqual(optionCount(), searchMatchCount('ja'), '键入 ja 的命中数应与全量目录搜索一致');
  // 命中覆盖日文音色 → 搜索确实跨语言，没被语言范围视图限住
  assert.ok(searchMatchCount('ja') >= jaCount, '全量搜索应覆盖日文音色');
  input.value = '';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

await test('键入后重新聚焦回到中文默认视图', () => {
  const input = byId('voice-search');
  input.value = 'en';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.strictEqual(optionCount(), searchMatchCount('en'), '键入 en 的命中数应与全量目录搜索一致');
  input.dispatchEvent(new window.FocusEvent('focus'));
  assert.strictEqual(optionCount(), ZH_COUNT, '重新聚焦应回到中文默认视图');
});

// ---------------------------------------------------------------------------
console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

fs.rmSync(outfile, { force: true });
fs.rmSync(searchBundle, { force: true });
if (failed > 0) process.exitCode = 1;
