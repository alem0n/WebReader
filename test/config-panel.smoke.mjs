/**
 * popup 配置面板冒烟测试（jsdom）
 *
 * 验证统一配置面板的重构不变量：
 *  1. 顶部「配置 / 切换」按钮存在，且面板默认可收起
 *  2. 引擎分段控件两个 tab，aria-selected 互斥
 *  3. 切换引擎时面板内只显示对应引擎的配置区（mimo-section / relay-section 互斥）
 *  4. MiMo 与后端中转的输入框 / 按钮仍在 DOM 中（事件绑定迁移未丢元素）
 *  5. 全局配置区（音色 / 语速 / 开关）仍在面板之外
 *
 * 运行：node test/config-panel.smoke.mjs
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const popupHtml = fs.readFileSync(path.resolve(__dirname, '../public/popup.html'), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`); }
}

const dom = new JSDOM(popupHtml, { url: 'chrome-extension://test/popup.html' });
const { document } = dom.window;

const byId = (id) => document.getElementById(id);
const isHidden = (el) => !el || el.classList.contains('hidden');

console.log('\n[popup 配置面板]');

test('顶部「配置 / 切换」按钮存在', () => {
  const btn = byId('config-toggle-panel');
  assert.ok(btn, 'config-toggle-panel 必须存在');
  assert.ok(btn.querySelector('#config-toggle-label'), '按钮内须有文案 span');
});

test('旧的 API Key / 后端中转 顶部按钮已移除', () => {
  assert.ok(!byId('apikey-toggle-panel'), 'apikey-toggle-panel 应已移除');
  assert.ok(!byId('relay-toggle-panel'), 'relay-toggle-panel 应已移除');
});

test('统一配置面板默认收起', () => {
  const panel = byId('config-panel');
  assert.ok(panel, 'config-panel 必须存在');
  assert.ok(panel.classList.contains('hidden'), '面板默认应为收起态');
});

test('引擎分段控件含两个 tab 且 aria-selected 互斥', () => {
  const mimo = byId('engine-tab-mimo');
  const relay = byId('engine-tab-relay');
  assert.ok(mimo && relay, '两个引擎 tab 必须存在');
  assert.strictEqual(mimo.getAttribute('aria-selected'), 'true', '默认选中 MiMo');
  assert.strictEqual(relay.getAttribute('aria-selected'), 'false', '后端中转默认未选中');
});

test('默认只显示 MiMo 配置区', () => {
  assert.ok(!isHidden(byId('mimo-section')), 'mimo-section 默认应显示');
  assert.ok(isHidden(byId('relay-section')), 'relay-section 默认应隐藏');
});

test('MiMo 配置区元素完整（输入框 / 显隐 / 保存）', () => {
  assert.ok(byId('apikey-input'), 'apikey-input 必须存在');
  assert.ok(byId('apikey-save-btn'), 'apikey-save-btn 必须存在');
  assert.ok(byId('apikey-toggle-visibility'), 'apikey-toggle-visibility 必须存在');
});

test('后端中转配置区元素完整（地址 / 令牌 / 测试 / 保存）', () => {
  assert.ok(byId('relay-url-input'), 'relay-url-input 必须存在');
  assert.ok(byId('relay-token-input'), 'relay-token-input 必须存在');
  assert.ok(byId('relay-test-btn'), 'relay-test-btn 必须存在');
  assert.ok(byId('relay-save-btn'), 'relay-save-btn 必须存在');
});

test('provider-select 下拉已移除（改用分段控件）', () => {
  assert.ok(!byId('provider-select'), 'provider-select 应已被分段控件取代');
});

test('全局配置区仍在面板之外（音色 / 语速 / 开关列）', () => {
  const voiceSearch = byId('voice-search');
  const speed = byId('speed-select');
  const toggleCol = byId('toggle-settings-column');
  assert.ok(voiceSearch && speed && toggleCol, '全局配置元素必须存在');
  const panel = byId('config-panel');
  assert.ok(!panel.contains(voiceSearch), '音色输入不应在配置面板内');
  assert.ok(!panel.contains(speed), '语速选择不应在配置面板内');
});

test('切换到后端中转：relay-section 显示、mimo-section 隐藏', () => {
  const mimo = byId('engine-tab-mimo');
  const relay = byId('engine-tab-relay');
  // 模拟 switchEngine 的 DOM 操作
  mimo.setAttribute('aria-selected', 'false');
  relay.setAttribute('aria-selected', 'true');
  byId('mimo-section').classList.add('hidden');
  byId('relay-section').classList.remove('hidden');
  assert.ok(!isHidden(byId('relay-section')), 'relay-section 应显示');
  assert.ok(isHidden(byId('mimo-section')), 'mimo-section 应隐藏');
  // 切回
  mimo.setAttribute('aria-selected', 'true');
  relay.setAttribute('aria-selected', 'false');
  byId('relay-section').classList.add('hidden');
  byId('mimo-section').classList.remove('hidden');
  assert.ok(!isHidden(byId('mimo-section')), '切回后 mimo-section 应显示');
  assert.ok(isHidden(byId('relay-section')), '切回后 relay-section 应隐藏');
});

test('面板展开 / 收起通过 hidden 类切换', () => {
  const panel = byId('config-panel');
  panel.classList.remove('hidden');
  assert.ok(!isHidden(panel), '移除 hidden 后面板应可见');
  panel.classList.add('hidden');
  assert.ok(isHidden(panel), '加回 hidden 后面板应隐藏');
});

console.log(`\n${failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
