/**
 * 统一配置面板：「配置 / 切换」入口 + 引擎分段切换 + 各引擎配置。
 *
 * - 顶部「配置 / 切换」按钮控制面板显隐，按钮文案反映当前引擎与配置状态
 * - 引擎切换（MiMo / 后端中转）立即落盘 provider，面板内只显示当前引擎的配置表单
 * - MiMo 沿用 apikey-* DOM 与保存逻辑；后端中转沿用 relay-* DOM 与保存 / 自检逻辑
 * - 全局配置（音色 / 语速 / 开关）与引擎无关，保持在面板之外，跨 provider 生效
 *
 * 文案一律写死中文（AGENTS.md §1.1：不新增 i18n 键）。
 * 权限：保存后端地址时按 origin 运行时申请主机权限，安装期不声明 <all_urls>。
 */
import { state } from './state';
import { sendToBackground } from '../shared/messaging';
import { readTtsProvider, setProvider } from '../shared/settings';
import type { RelayConfigResponse, TtsProvider } from '../shared/types';
import { logger } from './log';
import { loadVoicesWithRetry } from './api-key-ui';

type EngineTab = 'mimo' | 'relay';

/** 面板是否展开 */
function isConfigPanelOpen(): boolean {
  const panel = document.getElementById('config-panel');
  return !!panel && !panel.classList.contains('hidden');
}

export function setConfigPanelOpen(open: boolean): void {
  const panel = document.getElementById('config-panel');
  const toggle = document.getElementById('config-toggle-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** 当前选中的引擎（从 DOM 读取，避免与存储状态不一致） */
function activeEngine(): EngineTab {
  const relayTab = document.getElementById('engine-tab-relay');
  return relayTab && relayTab.getAttribute('aria-selected') === 'true' ? 'relay' : 'mimo';
}

/** 切换面板内显示的引擎配置区，并同步分段控件选中态 */
function setActiveEngine(engine: EngineTab): void {
  const mimoTab = document.getElementById('engine-tab-mimo');
  const relayTab = document.getElementById('engine-tab-relay');
  const mimoSection = document.getElementById('mimo-section');
  const relaySection = document.getElementById('relay-section');
  if (!mimoTab || !relayTab || !mimoSection || !relaySection) return;

  mimoTab.setAttribute('aria-selected', engine === 'mimo' ? 'true' : 'false');
  relayTab.setAttribute('aria-selected', engine === 'relay' ? 'true' : 'false');
  mimoSection.classList.toggle('hidden', engine !== 'mimo');
  relaySection.classList.toggle('hidden', engine !== 'relay');

  if (engine === 'relay') {
    const input = document.getElementById('relay-url-input') as HTMLInputElement | null;
    if (input) input.focus();
    hideRelayError();
  } else {
    const input = document.getElementById('apikey-input') as HTMLInputElement | null;
    if (input) input.focus();
  }
}

/** 顶部按钮文案：当前引擎 + 配置状态 */
export function updateConfigToggleLabel(provider: TtsProvider, configured: boolean): void {
  const label = document.getElementById('config-toggle-label');
  if (!label) return;
  const engineName = provider === 'relay' ? '后端中转' : 'MiMo';
  label.textContent = `${engineName} · ${configured ? '已配置' : '未配置'}`;
}

// ---------------- 后端中转：状态与错误展示 ----------------

function showRelayError(msg: string): void {
  const el = document.getElementById('relay-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideRelayError(): void {
  const el = document.getElementById('relay-error');
  if (el) el.classList.add('hidden');
}

/** 展示后端状态（连通性自检结果，分级文案） */
function showRelayStatus(text: string, type: 'ok' | 'warn' | 'err'): void {
  const el = document.getElementById('relay-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'relay-status relay-status--' + type;
  el.classList.remove('hidden');
}

/**
 * 把后端自检结果翻译成**可操作分级文案**（plan.md §四 链路 4）。
 *
 * 三类 403 成因分别引导：时钟偏差（后端已自动校正重试仍失败）/ IP 或地区受限
 * （需给后端配出站代理）/ 端点漂移（等后端更新端点常量）。
 */
function describeRelayStatus(response: RelayConfigResponse): { text: string; type: 'ok' | 'warn' | 'err' } {
  if (response.healthy) {
    const engines = response.engines && response.engines.length > 0 ? response.engines.join(', ') : '未知';
    const latency = response.upstreamLatencyMs !== undefined ? `${response.upstreamLatencyMs}ms` : '未知';
    return { text: `✅ 连通正常（引擎：${engines}，上游延迟 ${latency}）`, type: 'ok' };
  }
  const err = response.error || '未知原因';
  // 后端起来但上游不可达：按三类 403 成因给出可操作引导
  if (response.upstreamError) {
    if (/403|auth|鉴权|令牌/i.test(response.upstreamError)) {
      return {
        text: `⚠️ 后端已连接，但上游 Edge 鉴权失败：可能是时钟偏差（后端已自动校正仍失败）、IP 或地区受限，或端点漂移。请检查后端日志。`,
        type: 'warn',
      };
    }
    return { text: `⚠️ 后端已连接，但上游不可达：${response.upstreamError}`, type: 'warn' };
  }
  if (/权限|permission|authorized/i.test(err)) {
    return { text: `❌ ${err}。请到扩展设置中开启该地址的主机权限。`, type: 'err' };
  }
  if (/无法连接|Failed to fetch|Network/i.test(err)) {
    return { text: `❌ 后端不可达：${err}。请确认后端已启动且地址正确。`, type: 'err' };
  }
  return { text: `❌ ${err}`, type: 'err' };
}

/** 查询后端配置与连通性，回填界面并更新顶部按钮状态 */
export async function refreshRelayStatus(): Promise<RelayConfigResponse> {
  let response: RelayConfigResponse;
  try {
    response = await sendToBackground<RelayConfigResponse>({ action: 'checkRelayStatus' });
  } catch (e) {
    logger.error('checkRelayStatus failed:', e);
    response = { success: false, error: (e as Error).message };
  }
  if (!response) response = { success: false };

  const urlInput = document.getElementById('relay-url-input') as HTMLInputElement | null;
  const tokenInput = document.getElementById('relay-token-input') as HTMLInputElement | null;
  if (urlInput && response.url) urlInput.value = response.url;
  if (tokenInput && response.maskedToken) tokenInput.value = response.maskedToken;

  if (isConfigPanelOpen() && activeEngine() === 'relay') {
    const status = describeRelayStatus(response);
    showRelayStatus(status.text, status.type);
  }
  return response;
}

// ---------------- 引擎切换 ----------------

/** 通知 background 落盘新 provider 并广播 content 刷新音色缓存 */
async function notifyContentProviderChanged(provider: TtsProvider): Promise<void> {
  try {
    await sendToBackground<RelayConfigResponse>({ action: 'switchProvider', provider });
  } catch (e) {
    logger.warn('notifyContentProviderChanged failed:', e);
  }
}

/**
 * 切换引擎：先同步切换面板表单（即时反馈）→ 落盘 provider → 通知 content 刷新
 * → 重载音色。面板内已填的配置不清空，切回仍能看到。
 * 先切 UI 后落盘：界面响应不依赖存储回调时序；落盘失败只提示不回滚
 * （下次打开会以存储为准重新同步，用户也可再点一次重试）。
 */
export async function switchEngine(engine: EngineTab): Promise<void> {
  if (activeEngine() === engine) return;
  // 1) 同步切换界面：用户立即看到选中态与对应引擎表单
  setActiveEngine(engine);
  showRelayStatus(engine === 'relay' ? '已切换到后端中转，正在刷新音色列表…' : '已切换到 MiMo 直连，正在刷新音色列表…', 'ok');
  try {
    // 2) 落盘 provider
    await setProvider(engine);
    logger.info('provider switched to', engine);
    void notifyContentProviderChanged(engine);

    // 3) 清旧音色视图并重载（音色目录随 provider 变化）
    state.allVoices = [];
    state.filteredVoices = [];
    state.selectedVoice = null;
    const searchInput = document.getElementById('voice-search') as HTMLInputElement | null;
    if (searchInput) searchInput.value = '';
    try {
      await loadVoicesWithRetry({ authStage: 'engine-switch', maxAttempts: 3 });
    } catch (voiceErr) {
      // 音色重载失败不回滚引擎切换（切换本身已成功），只记录日志
      logger.warn('engine-switch voice reload failed:', voiceErr);
    }
  } catch (e) {
    showRelayError('切换失败：' + ((e as Error).message || '未知错误'));
  }
}

/** 读取存储中的 provider 并同步面板选中态（初始化时调用） */
export async function syncEngineFromStorage(): Promise<TtsProvider> {
  const provider = await readTtsProvider();
  setActiveEngine(provider === 'relay' ? 'relay' : 'mimo');
  return provider;
}

// ---------------- 事件绑定 ----------------

/** 绑定面板事件（DOMContentLoaded 后调用） */
export function setupConfigUI(): void {
  const panelToggle = document.getElementById('config-toggle-panel');
  const mimoTab = document.getElementById('engine-tab-mimo');
  const relayTab = document.getElementById('engine-tab-relay');

  // 顶部「配置 / 切换」按钮：展开 / 收起统一配置面板
  if (panelToggle) {
    panelToggle.addEventListener('click', () => {
      setConfigPanelOpen(!isConfigPanelOpen());
      if (isConfigPanelOpen()) void refreshRelayStatus();
    });
  }

  // 引擎分段切换：立即落盘并切换面板内表单
  if (mimoTab) {
    mimoTab.addEventListener('click', () => {
      if (activeEngine() !== 'mimo') void switchEngine('mimo');
    });
  }
  if (relayTab) {
    relayTab.addEventListener('click', () => {
      if (activeEngine() !== 'relay') void switchEngine('relay');
    });
  }

  setupRelaySection();
}

/** 后端中转区：保存（含权限申请与引擎切换）与测试连接 */
function setupRelaySection(): void {
  const saveBtn = document.getElementById('relay-save-btn') as HTMLButtonElement | null;
  const testBtn = document.getElementById('relay-test-btn') as HTMLButtonElement | null;
  const urlInput = document.getElementById('relay-url-input') as HTMLInputElement | null;
  const tokenInput = document.getElementById('relay-token-input') as HTMLInputElement | null;

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const url = urlInput ? urlInput.value.trim() : '';
      const token = tokenInput ? tokenInput.value.trim() : '';
      if (!url) {
        showRelayError('请输入后端地址');
        return;
      }
      // 脱敏占位不当作真实 Token 回传
      const realToken = token && token.includes('****') ? '' : token;
      saveBtn.disabled = true;
      try {
        const res = await sendToBackground<RelayConfigResponse>({ action: 'saveRelayConfig', url, token: realToken });
        if (res && res.success) {
          hideRelayError();
          showRelayStatus('✅ 后端配置已保存', 'ok');
          if (urlInput) urlInput.value = res.url || url;
          if (tokenInput && res.maskedToken) tokenInput.value = res.maskedToken;
          // 保存成功后切到 relay provider，避免配了中转却仍走 MiMo
          await switchEngine('relay');
          updateConfigToggleLabel('relay', true);
        } else {
          showRelayError((res && res.error) || '保存失败，请重试');
        }
      } catch (e) {
        logger.error('saveRelayConfig error:', e);
        showRelayError('保存失败：' + ((e as Error).message || '未知错误'));
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      try {
        showRelayStatus('正在测试连接…', 'ok');
        const res = await refreshRelayStatus();
        if (!res.success && res.error) {
          showRelayError(res.error);
        }
      } finally {
        testBtn.disabled = false;
      }
    });
  }

  if (urlInput) {
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && saveBtn) saveBtn.click();
    });
  }
}
