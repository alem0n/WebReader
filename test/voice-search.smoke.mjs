/**
 * 音色搜索通用性回归（纯逻辑，jsdom 不需要）
 *
 * 守护「音色过滤引擎无关」：MiMo 预置目录与 relay（Edge）后端目录发射的
 * PresetVoice 形状不同（MiMo 无 gender、name 是「冰糖」；Edge 有 gender、
 * name 是 zh-CN-XiaoxiaoNeural），搜索行为必须对两者一致——语言名 / 国家名 /
 * 性别 / 通称别名都能命中，且不随当前界面语言变化。
 *
 * 修复前：过滤逻辑写在 popup 视图层且只覆盖 MiMo 音色出现的字段，
 * Edge 音色搜「女」「男」「中国」「美国」全部命中 0 条。
 *
 * 运行：node test/voice-search.smoke.mjs
 */
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outfile = resolve(__dirname, '.voice-search.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/shared/voice-search.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  logLevel: 'silent',
});

const { matchVoiceSearchTerm } = await import(pathToFileURL(outfile).href);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

/** 命中数断言：term 对 voices 的过滤结果数必须等于 expected */
function hits(term, voices, expected, label) {
  const got = voices.filter((v) => matchVoiceSearchTerm(v, term)).length;
  assert.strictEqual(got, expected, `搜「${term}」应命中 ${expected} 个${label ? '（' + label + '）' : ''}，实际 ${got}`);
}

// MiMo 预置形状（无 gender，name 为中文 / 英文人名）
const MIMO = [
  { name: 'MiMo-默认', voice: 'mimo_default', language: 'zh-CN' },
  { name: '冰糖', voice: '冰糖', language: 'zh-CN' },
  { name: '茉莉', voice: '茉莉', language: 'zh-CN' },
  { name: 'Mia', voice: 'Mia', language: 'en-US' },
  { name: 'Chloe', voice: 'Chloe', language: 'en-US' },
];

// relay（Edge）后端目录形状（有 gender，name 为 ShortName）
const EDGE = [
  { name: 'zh-CN-XiaoxiaoNeural', voice: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN', gender: 'Female' },
  { name: 'zh-CN-YunxiNeural', voice: 'zh-CN-YunxiNeural', language: 'zh-CN', gender: 'Male' },
  { name: 'en-US-AriaNeural', voice: 'en-US-AriaNeural', language: 'en-US', gender: 'Female' },
  { name: 'en-US-GuyNeural', voice: 'en-US-GuyNeural', language: 'en-US', gender: 'Male' },
  { name: 'ja-JP-NanamiNeural', voice: 'ja-JP-NanamiNeural', language: 'ja-JP', gender: 'Female' },
];

console.log('\n[语言名搜索：中英双向]');

test('中文搜「中文」命中全部中文音色（MiMo）', () => {
  hits('中文', MIMO, 3);
  hits('中文', EDGE, 2);
});

test('中文搜「英文 / 英语」命中全部英文音色（MiMo + Edge）', () => {
  hits('英文', MIMO, 2);
  hits('英语', EDGE, 2);
});

test('英文搜 Chinese / English 同样命中（不随界面语言变化）', () => {
  hits('Chinese', MIMO, 3);
  hits('Chinese', EDGE, 2);
  hits('English', EDGE, 2);
});

test('语言代码拆段：zh / en / CN / US 可命中', () => {
  hits('zh', EDGE, 2);
  hits('en', EDGE, 2);
  hits('CN', EDGE, 2);
  hits('US', EDGE, 2);
});

console.log('\n[国家名搜索：Edge 音色此前完全搜不到]');

test('搜「中国」命中 zh-CN 音色（Edge）', () => {
  hits('中国', EDGE, 2);
});

test('搜「美国 / United States」命中 en-US 音色（Edge）', () => {
  hits('美国', EDGE, 2);
  hits('United States', EDGE, 2);
});

console.log('\n[性别搜索：Edge 音色此前完全搜不到]');

test('搜「女」命中 Female、「男」命中 Male（Edge）', () => {
  hits('女', EDGE, 3);
  hits('男', EDGE, 2);
});

test('搜 Female / Male 同样命中（Edge）', () => {
  hits('Female', EDGE, 3);
  hits('Male', EDGE, 2);
});

console.log('\n[音色名与 voice id]');

test('MiMo 音色名可搜（冰糖）', () => {
  hits('冰糖', MIMO, 1);
});

test('Edge ShortName 可搜（Aria / xiaoxiao）', () => {
  hits('Aria', EDGE, 1);
  hits('xiaoxiao', EDGE, 1);
});

test('voice id 可搜（mimo_default）', () => {
  hits('mimo_default', MIMO, 1);
});

test('搜「日语 / Japanese」命中 ja-JP 音色（扩展性）', () => {
  hits('日语', EDGE, 1);
  hits('Japanese', EDGE, 1);
});

console.log('\n[边界]');

test('空搜索词匹配全部（调用方自行处理展示，匹配函数本身容错）', () => {
  hits('', MIMO, 5);
  hits('', EDGE, 5);
});

test('大小写不敏感', () => {
  hits('ARIA', EDGE, 1);
  hits('chinese', EDGE, 2);
});

test('不存在的词命中 0', () => {
  hits('zzz-not-exist', EDGE, 0);
});

test('MiMo 无 gender 音色搜「女」不崩溃且命中 0', () => {
  hits('女', MIMO, 0);
});

// ---------------------------------------------------------------------------
console.log(`\n=================================`);
console.log(`通过 ${passed}  /  失败 ${failed}`);
console.log(`=================================\n`);

fs.rmSync(outfile, { force: true });
if (failed > 0) process.exitCode = 1;
