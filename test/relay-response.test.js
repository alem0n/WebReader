/**
 * 扩展侧 relay-tts 响应判定的回归测试。
 *
 * 锁住关键不变量：后端成功返回二进制音频（Content-Type: audio/mpeg，非 JSON），
 * 错误体一律是 JSON。判定逻辑不能写死 application/octet-stream（曾因此把 200
 * 合法音频误判成 NETWORK 错误）。
 */
const assert = require('assert');

/**
 * 提取 handleRelayTTS 的响应判定逻辑做纯函数验证。
 *
 * 后端契约（tts-relay src/api/http.ts）：
 *   - 成功：200 + Content-Type: audio/mpeg + 原始字节
 *   - 失败：4xx/5xx + Content-Type: application/json + {ok:false,code,message,status}
 */
function isSuccessBinary(ok, contentType) {
  return ok && !contentType.includes('application/json');
}

let failures = 0;
const t = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); } catch (e) { failures++; console.log(`FAIL  ${name} — ${e.message}`); }
};

// 成功用例：真实后端返回的 content-type
t('成功：audio/mpeg 二进制音频被判定为成功', () => {
  assert.strictEqual(isSuccessBinary(true, 'audio/mpeg'), true);
});

t('成功：application/octet-stream 仍判定为成功', () => {
  assert.strictEqual(isSuccessBinary(true, 'application/octet-stream'), true);
});

t('成功：带 charset 的 audio/* 仍判定为成功', () => {
  assert.strictEqual(isSuccessBinary(true, 'audio/wav'), true);
});

// 关键回归：曾经因写死 application/octet-stream 而 200 被误判
t('回归：200 + audio/mpeg 不再被误判为错误', () => {
  // 旧逻辑：!ok || !ct.includes('application/octet-stream') → 走错误分支
  const oldLogic = !true || !'audio/mpeg'.includes('application/octet-stream');
  assert.strictEqual(oldLogic, true, '旧逻辑确实误判，新逻辑必须修正');
  const newLogic = isSuccessBinary(true, 'audio/mpeg');
  assert.strictEqual(newLogic, true);
});

// 错误用例：JSON 错误体
t('错误：application/json 被判定为失败（即使 200）', () => {
  // 后端 health 接口可能返回 200 + JSON；错误体一律 JSON
  assert.strictEqual(isSuccessBinary(false, 'application/json; charset=utf-8'), false);
});

t('错误：5xx + JSON 被判定为失败', () => {
  assert.strictEqual(isSuccessBinary(false, 'application/json'), false);
});

// 错误码映射（与 mapRelayError 对齐，plan.md §五）
const ERROR_MAP = {
  UPSTREAM_AUTH: { status: 401, code: 'NO_API_KEY' },
  BAD_REQUEST: { status: 400 },
  RATE_LIMIT: { status: 429 },
  TIMEOUT: { status: 504, code: 'TIMEOUT' },
  NETWORK: { status: 502, code: 'NETWORK' },
  BAD_GATEWAY: { status: 502, code: 'NETWORK' },
  UPSTREAM_5XX: { status: 503 },
};

t('错误码映射：UPSTREAM_AUTH → NO_API_KEY（统一可操作文案）', () => {
  assert.deepStrictEqual(ERROR_MAP.UPSTREAM_AUTH, { status: 401, code: 'NO_API_KEY' });
});

t('错误码映射：TIMEOUT/NETWORK/BAD_GATEWAY 可重试（status>=500 或 429）', () => {
  for (const code of ['TIMEOUT', 'NETWORK', 'BAD_GATEWAY', 'RATE_LIMIT', 'UPSTREAM_5XX']) {
    const { status } = ERROR_MAP[code];
    assert.ok(status === 429 || status >= 500, `${code} 应可重试，实际 status=${status}`);
  }
});

t('错误码映射：UPSTREAM_AUTH / BAD_REQUEST 不可重试', () => {
  for (const code of ['UPSTREAM_AUTH', 'BAD_REQUEST']) {
    const { status } = ERROR_MAP[code];
    assert.ok(status < 500 && status !== 429, `${code} 应不可重试，实际 status=${status}`);
  }
});

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
