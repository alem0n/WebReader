/**
 * 音色提供方冒烟测试：各引擎独立提供音色选项，消息处理器按 provider 路由。
 *
 * 验证 VoiceProvider 架构的三条不变式：
 *  1. MiMo provider 返回本地常量目录（无网络）；
 *  2. relay provider 透传后端 /v1/voices（fetch 桩模拟成功 / 无配置）；
 *  3. 注册表按 provider 路由到对应实现，未注册时回退 MiMo。
 *
 * 真实模块：background/voices/* + shared/voice-default；桩：fetch / storage。
 * getPresetVoices 消息处理器不在此测（依赖 chrome.runtime，由端到端测试覆盖）。
 */
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as assert from 'node:assert';
import { rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIMO_PRESET_LEN = 9; // MiMo 预置音色数量（与 shared/constants 一致）

// 可编程 storage，供 relay-config 读取 relay_url / relay_token。
// relay-config 用 Promise 式 get（不传回调），widget 类模块用回调式，两种都支持。
let store = {};
function storageGet(keys, cb) {
  const out = {};
  (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
    if (k in store) out[k] = store[k];
  });
  if (typeof cb === 'function') cb(out);
  return Promise.resolve(out);
}
globalThis.chrome = {
  storage: {
    local: {
      get: storageGet,
      set: (obj, cb) => {
        Object.assign(store, obj);
        cb && cb();
      },
    },
  },
  runtime: { sendMessage: (m, cb) => cb({ success: false }), lastError: null },
  i18n: { getMessage: () => null },
};

// relay provider 的 fetch 桩（默认抛错，用例内按需覆盖）
let fetchImpl = async () => {
  throw new Error('fetch stub not configured');
};
globalThis.fetch = (url, opts) => fetchImpl(url, opts);

const bundle = resolve(__dirname, '.voice-providers.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/background/voices/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: bundle,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});
const m = await import(pathToFileURL(bundle).href);

// 独立 bundle 取 pickDefaultVoice（voice-default 不依赖 background，直接打入口）
const vdBundle = resolve(__dirname, '.voice-default.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, '../src/shared/voice-default.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: vdBundle,
  logLevel: 'silent',
});
const { pickDefaultVoice } = await import(pathToFileURL(vdBundle).href);

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

console.log('\n[音色提供方]');

await test('MiMo provider 返回本地常量目录（数量与常量一致）', async () => {
  const r = await m.getVoiceProviderOrFallback('mimo').getVoices();
  assert.ok('voices' in r, '应返回 voices');
  assert.equal(r.voices.length, MIMO_PRESET_LEN);
  assert.equal(r.voices[0].voice, 'mimo_default', '目录首个应为默认音色');
});

await test('relay provider 透传后端 /v1/voices', async () => {
  store = { relay_url: 'https://relay.example.com', relay_token: 'sekret' };
  const relayVoices = [
    { name: 'zh-CN-XiaoxiaoNeural', voice: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN', gender: 'Female' },
    { name: 'en-US-AriaNeural', voice: 'en-US-AriaNeural', language: 'en-US', gender: 'Female' },
  ];
  let requestedUrl = null;
  let requestedAuth = null;
  fetchImpl = async (url, opts) => {
    requestedUrl = String(url);
    requestedAuth = (opts && opts.headers && opts.headers.Authorization) || null;
    return {
      ok: true,
      json: async () => ({ ok: true, count: 2, voices: relayVoices }),
    };
  };
  const provider = m.resolveVoiceProvider('relay');
  assert.ok(provider, 'relay 应已注册');
  const r = await provider.getVoices();
  assert.ok('voices' in r);
  assert.equal(requestedUrl, 'https://relay.example.com/v1/voices', '应请求 /v1/voices');
  assert.equal(requestedAuth, 'Bearer sekret', '应带 Authorization 头');
  assert.equal(r.voices.length, 2);
  assert.equal(r.voices[0].name, 'zh-CN-XiaoxiaoNeural');
});

await test('relay 未配置地址 → 返回错误信息，不发起请求', async () => {
  store = {}; // 无 relay_url
  let fetched = false;
  fetchImpl = async () => {
    fetched = true;
    throw new Error('不应发起请求');
  };
  const provider = m.resolveVoiceProvider('relay');
  const r = await provider.getVoices();
  assert.ok(!fetched, '未配置地址不应发起请求');
  assert.ok('error' in r, '应返回 error');
  assert.ok(/尚未配置/.test(r.error), '错误文案应提示未配置');
});

await test('relay 后端返回非数组 → 返回格式无效错误', async () => {
  store = { relay_url: 'https://relay.example.com' };
  fetchImpl = async () => ({
    ok: true,
    json: async () => ({ ok: true }), // 无 voices 字段
  });
  const provider = m.resolveVoiceProvider('relay');
  const r = await provider.getVoices();
  assert.ok('error' in r);
  assert.ok(/格式无效/.test(r.error));
});

await test('注册表：未知 provider 回退 MiMo', () => {
  const fallback = m.getVoiceProviderOrFallback('nonexistent');
  assert.equal(fallback.provider, 'mimo', '未知 provider 应回退 MiMo');
});

await test('pickDefaultVoice：界面语言命中 / 无匹配回退目录首个 / 空目录返回 null', () => {
  const relayVoices = [
    { name: 'zh-CN-X', voice: 'zh-CN-X', language: 'zh-CN' },
    { name: 'en-US-A', voice: 'en-US-A', language: 'en-US' },
  ];
  assert.equal(pickDefaultVoice(relayVoices, 'zh_CN').name, 'zh-CN-X');
  assert.equal(pickDefaultVoice(relayVoices, 'en').name, 'en-US-A');
  // 界面语言在目录中无匹配 → 回退目录首个（各引擎默认音色）
  assert.equal(pickDefaultVoice([relayVoices[1]], 'zh_CN').name, 'en-US-A');
  // 目录为空 → null（不崩溃）
  assert.equal(pickDefaultVoice([], 'zh_CN'), null);
});

rmSync(bundle, { force: true });
rmSync(vdBundle, { force: true });

console.log(`\n${failed === 0 ? 'ALL PASSED' : 'HAS FAILURES'} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exitCode = 1;
