/** 后端模块单测：令牌窗口行为、文本切分、语速映射、SSML、帧编解码。 */
const assert = require('assert');

const ROOT = require('path').resolve(__dirname, '..');

const { SecMsGecToken } = require(`${ROOT}/dist/engines/edge/token.js`);
const { splitTextOnEntityBoundary, prepareTextForSynthesis, stripControlChars, escapeXml } = require(`${ROOT}/dist/engines/edge/text.js`);
const { speedToRatePercent, buildSsml } = require(`${ROOT}/dist/engines/edge/ssml.js`);
const { decodeBinaryFrame, encodeTextFrame, getFramePath } = require(`${ROOT}/dist/engines/edge/frames.js`);

let failures = 0;
const t = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); } catch (e) { failures++; console.log(`FAIL  ${name} — ${e.message}`); }
};

// ---- 令牌 ----
t('令牌为 64 位大写十六进制', () => {
  const tok = new SecMsGecToken('6A5AA1D4EAFF4E9FB37E23D68491D6F4');
  const v = tok.current().value;
  assert.ok(/^[0-9A-F]{64}$/.test(v), `value=${v}`);
});

t('同一窗口内令牌稳定（缓存）', () => {
  const tok = new SecMsGecToken('6A5AA1D4EAFF4E9FB37E23D68491D6F4');
  const a = tok.current();
  const b = tok.current();
  assert.strictEqual(a.value, b.value);
  assert.strictEqual(a.windowStart, b.windowStart);
});

t('令牌与独立算法一致（BigInt 参考实现）', () => {
  const crypto = require('crypto');
  const unix = Math.floor(Date.now() / 1000);
  const win = unix + 11644473600 - ((unix + 11644473600) % 300);
  const ref = crypto.createHash('sha256').update((BigInt(win) * 10000000n).toString() + '6A5AA1D4EAFF4E9FB37E23D68491D6F4').digest('hex').toUpperCase();
  const tok = new SecMsGecToken('6A5AA1D4EAFF4E9FB37E23D68491D6F4');
  assert.strictEqual(tok.current().value, ref);
});

t('applyServerDate 校正时钟后令牌改变', () => {
  const tok = new SecMsGecToken('6A5AA1D4EAFF4E9FB37E23D68491D6F4');
  const before = tok.current().value;
  // 服务端比本地快 1 小时 → 窗口推进，令牌应变化
  const future = new Date(Date.now() + 3600 * 1000).toUTCString();
  tok.applyServerDate(future);
  const after = tok.current().value;
  assert.notStrictEqual(before, after);
});

t('applyServerDate 对非法日期不爆炸', () => {
  const tok = new SecMsGecToken('6A5AA1D4EAFF4E9FB37E23D68491D6F4');
  const before = tok.current().value;
  tok.applyServerDate('not-a-date');
  assert.strictEqual(tok.current().value, before);
});

// ---- 文本 ----
t('控制字符被替换为空格（保留 \\t\\n\\r）', () => {
  assert.strictEqual(stripControlChars('a\x00b\x0Bc\x1Fdw'), 'a b c dw');
  assert.strictEqual(stripControlChars('a\tb\nc\rd'), 'a\tb\nc\rd');
});

t('XML 转义完整', () => {
  assert.strictEqual(escapeXml('a<b>&"c\'d'), 'a&lt;b&gt;&amp;&quot;c&apos;d');
});

t('实体边界切分不在 &xxx; 中间断开', () => {
  const entity = '&amp;'.repeat(200);
  const segs = splitTextOnEntityBoundary(entity, 4096);
  assert.ok(segs.length >= 1);
  // 切分后每段仍是完整实体串
  for (const s of segs) assert.ok(/^(&amp;)*$/.test(s), `bad segment: ${s.slice(0, 40)}`);
});

t('prepareTextForSynthesis：清洗 + 转义 + 按字节切', () => {
  const text = '你好\x00世界。<b>标签</b>&实体;';
  const segs = prepareTextForSynthesis(text, 4096);
  assert.strictEqual(segs.length, 1);
  assert.ok(!segs[0].includes('<b>'));
  assert.ok(segs[0].includes('&lt;b&gt;'));
  assert.ok(!segs[0].includes('\x00'));
});

t('超长文本按 4096 字节切成多段', () => {
  const segs = prepareTextForSynthesis('测试文本内容。'.repeat(2000), 4096);
  assert.ok(segs.length > 1, `segments=${segs.length}`);
  for (const s of segs) assert.ok(Buffer.byteLength(s, 'utf8') <= 4096, `segment too long: ${Buffer.byteLength(s)}`);
});

// ---- SSML ----
t('语速映射并钳制到 -50%..+100%', () => {
  assert.strictEqual(speedToRatePercent(0.5), '-50%');
  assert.strictEqual(speedToRatePercent(1.0), '+0%');
  assert.strictEqual(speedToRatePercent(2.0), '+100%');
  assert.strictEqual(speedToRatePercent(1.5), '+50%');
  assert.strictEqual(speedToRatePercent(3.0), '+100%'); // 钳制
  assert.strictEqual(speedToRatePercent(0.1), '-50%'); // 钳制
});

t('SSML 含 voice + prosody（文本由调用方预转义）', () => {
  // 转义在引擎层 prepareTextForSynthesis 完成，buildSsml 不重复转义，避免双重转义
  const ssml = buildSsml({ voice: 'zh-CN-XiaoxiaoNeural', text: 'a&lt;b', speed: 1.25 });
  assert.ok(ssml.includes('<voice name="zh-CN-XiaoxiaoNeural">'));
  assert.ok(ssml.includes('rate="+25%"'));
  assert.ok(ssml.includes('xml:lang="zh-CN"'));
  assert.ok(ssml.includes('a&lt;b'));
});

// ---- 帧 ----
t('二进制帧载荷起点恰在 2+H', () => {
  const header = 'X-RequestId:abc\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n';
  const headerBytes = Buffer.from(header, 'latin1');
  const payload = Buffer.from([0xff, 0xf3, 0x64, 0xc4, 0x01, 0x02]);
  const frame = Buffer.concat([Buffer.from([0, headerBytes.length]), headerBytes, payload]);
  const decoded = decodeBinaryFrame(frame);
  assert.strictEqual(decoded.headers.get('path'), 'audio');
  assert.deepStrictEqual(Buffer.from(decoded.payload), payload);
});

t('文本帧 Path 解析（全小写）', () => {
  const f = encodeTextFrame('ssml', '<speak/>', { 'X-RequestId': 'abc' });
  const headerText = f.split('\r\n\r\n')[0];
  assert.strictEqual(getFramePath(headerText), 'ssml');
});

t('文本帧头体以 \\r\\n\\r\\n 分隔（修复回归）', () => {
  const f = encodeTextFrame('ssml', 'BODY', { 'X-RequestId': 'abc' });
  assert.ok(f.includes('Path:ssml\r\n\r\nBODY'), `frame=${JSON.stringify(f.slice(-30))}`);
});

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
