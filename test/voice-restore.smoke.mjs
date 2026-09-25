/**
 * 音色持久化恢复回归测试：旧版自动检测残留不应顶替界面语言默认音色。
 *
 * 背景（本次修复）：旧版按正文自动检测语言，检测出的音色直接写入 selectedVoice
 * 并落盘，但没有「是否手选」的标志。升级后恢复逻辑若把残留音色当手选恢复，
 * 中文界面会显示英文音色。修复引入持久化标志 voiceSelectionIsManual 作为
 * 「这个 selectedVoice 是不是用户真手选」的唯一判据（shared/voice-restore）：
 * 缺标志 / 为 false → 按界面语言重新派生；显式 true 且音色仍在目录内 → 沿用。
 *
 * 直接测纯函数 resolveRestoredVoice（不挂 widget DOM），断言四种持久化形态。
 * 落盘闭环（派生不落盘 / 手选落盘带标志）在 settings 层验证。
 */
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as assert from 'node:assert';
import { rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIMO_PRESET_VOICES = [
  { name: 'MiMo-默认', voice: 'mimo_default', language: 'zh-CN' },
  { name: '冰糖', voice: '冰糖', language: 'zh-CN' },
  { name: '茉莉', voice: '茉莉', language: 'zh-CN' },
  { name: 'Mia', voice: 'Mia', language: 'en-US' },
];

const bundle = resolve(__dirname, '.voice-restore.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/shared/voice-restore.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: bundle,
  logLevel: 'silent',
});
const { resolveRestoredVoice } = await import(pathToFileURL(bundle).href);

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

console.log('\n[音色持久化恢复判据]');

await test('旧版残留英文音色（无手选标志）→ 返回 null，交由界面语言派生', () => {
  const r = resolveRestoredVoice({ selectedVoice: 'Mia' }, MIMO_PRESET_VOICES);
  assert.equal(r, null, '缺 voiceSelectionIsManual 标志时不得按手选恢复');
});

await test('手选标志=false 的残留音色 → 返回 null', () => {
  const r = resolveRestoredVoice({ selectedVoice: 'Mia', voiceSelectionIsManual: false }, MIMO_PRESET_VOICES);
  assert.equal(r, null, '标志为 false 时不得按手选恢复');
});

await test('显式手选音色（在目录内）→ 返回该音色', () => {
  const r = resolveRestoredVoice({ selectedVoice: '茉莉', voiceSelectionIsManual: true }, MIMO_PRESET_VOICES);
  assert.ok(r, '真手选应返回音色');
  assert.equal(r.name, '茉莉');
});

await test('手选音色已不在当前目录（如切换 provider）→ 返回 null', () => {
  const r = resolveRestoredVoice({ selectedVoice: 'SOME_RELAY_VOICE', voiceSelectionIsManual: true }, MIMO_PRESET_VOICES);
  assert.equal(r, null, '目录内找不到时应回退派生，不沿用失效名');
});

await test('手选标志为 true 但 selectedVoice 为空 → 返回 null', () => {
  const r = resolveRestoredVoice({ selectedVoice: null, voiceSelectionIsManual: true }, MIMO_PRESET_VOICES);
  assert.equal(r, null);
});

await test('音色目录为空（尚未加载）→ 返回 null，不崩溃', () => {
  const r = resolveRestoredVoice({ selectedVoice: '茉莉', voiceSelectionIsManual: true }, []);
  assert.equal(r, null);
});

await test('设置对象为空 → 返回 null，不崩溃', () => {
  const r = resolveRestoredVoice(null, MIMO_PRESET_VOICES);
  assert.equal(r, null);
});

rmSync(bundle, { force: true });

console.log(`\n${failed === 0 ? 'ALL PASSED' : 'HAS FAILURES'} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exitCode = 1;
