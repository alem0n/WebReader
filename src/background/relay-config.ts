/**
 * 后端中转配置：relayUrl / relayToken 的存取、脱敏、连通性自检（仿 api-key.ts）。
 *
 * Token 是凭据：与 mimo_api_key 同级存 chrome.storage.local、由 background 保管、
 * 日志只出脱敏值。运行时按 origin 申请主机权限，安装期不声明 <all_urls>。
 */
import { RELAY_TOKEN_STORAGE, RELAY_URL_STORAGE } from '../shared/constants';
import type { RelayConfigResponse } from '../shared/types';
import { logger } from './log';
import { maskKey } from './api-key';

/** 读取已配置的后端地址（无配置返回空串） */
export async function getRelayUrl(): Promise<string> {
  try {
    const data = await chrome.storage.local.get(RELAY_URL_STORAGE);
    const url = data && data[RELAY_URL_STORAGE];
    return typeof url === 'string' ? url.trim() : '';
  } catch (e) {
    logger.warn('Failed to read relay url:', e);
    return '';
  }
}

/** 读取已配置的后端 Token（无配置返回空串） */
export async function getRelayToken(): Promise<string> {
  try {
    const data = await chrome.storage.local.get(RELAY_TOKEN_STORAGE);
    const token = data && data[RELAY_TOKEN_STORAGE];
    return typeof token === 'string' ? token.trim() : '';
  } catch (e) {
    logger.warn('Failed to read relay token:', e);
    return '';
  }
}

/**
 * 校验后端地址：必须是 http(s)，禁止 file/ftp；本地开发允许 http://localhost。
 * 返回归一化错误文案，供界面直接展示。
 */
function validateRelayUrl(raw: string): string | null {
  const url = (raw || '').trim();
  if (!url) return '后端地址不能为空';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '后端地址格式无效（需包含 http:// 或 https://）';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `不支持的网络协议「${parsed.protocol.replace(':', '')}」，请使用 http 或 https`;
  }
  // 明文 http 只允许本地开发地址，避免用户误填公网明文后端泄露 Token
  const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
  if (parsed.protocol === 'http:' && !isLocalHost) {
    return '公网地址必须使用 https，仅本地开发允许 http';
  }
  // 去掉末尾斜杠，避免拼成 //v1/tts
  return null;
}

/** 归一化地址：去末尾斜杠 */
function normalizeRelayUrl(raw: string): string {
  return (raw || '').trim().replace(/\/+$/, '');
}

/**
 * 保存后端配置（含 Token），并按 origin 申请主机权限。
 *
 * @returns RelayConfigResponse：权限被拒 / 地址非法时失败，不保存
 */
export async function saveRelayConfig(url: string, token: string | undefined): Promise<RelayConfigResponse> {
  const validationError = validateRelayUrl(url);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const normalized = normalizeRelayUrl(url);
  const origin = new URL(normalized).origin;

  // 运行时按 origin 申请主机权限：用户拒绝则不保存，并提示去设置开启
  try {
    const granted = await requestOriginPermission(origin);
    if (!granted) {
      return {
        success: false,
        error: `未授权访问 ${origin}。请在扩展设置中开启该地址的主机权限后重试。`,
      };
    }
  } catch (e) {
    logger.warn('Permission request failed:', e);
    return { success: false, error: `权限申请失败：${(e as Error).message}` };
  }

  try {
    await chrome.storage.local.set({ [RELAY_URL_STORAGE]: normalized });
    const tokenValue = (token || '').trim();
    await chrome.storage.local.set({ [RELAY_TOKEN_STORAGE]: tokenValue });
    logger.info('Relay config saved:', maskOrigin(normalized));
    return { success: true, url: normalized, maskedToken: tokenValue ? maskKey(tokenValue) : null };
  } catch (e) {
    logger.error('saveRelayConfig error:', e);
    return { success: false, error: (e as Error).message };
  }
}

/** 查询当前配置与连通性（不在 popup 暴露明文 Token） */
export async function checkRelayStatus(): Promise<RelayConfigResponse> {
  const url = await getRelayUrl();
  const token = await getRelayToken();

  if (!url) {
    return { success: true, url: null, maskedToken: null, healthy: false, error: '尚未配置后端地址' };
  }

  try {
    const response = await fetchHealth(url, token);
    if (!response.ok) {
      return {
        success: true,
        url,
        maskedToken: token ? maskKey(token) : null,
        healthy: false,
        error: `后端返回 HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as {
      engines?: string[];
      upstreamLatencyMs?: number;
      upstreamError?: string;
    };
    return {
      success: true,
      url,
      maskedToken: token ? maskKey(token) : null,
      healthy: true,
      engines: data.engines,
      upstreamLatencyMs: data.upstreamLatencyMs,
      upstreamError: data.upstreamError,
    };
  } catch (e) {
    return {
      success: true,
      url,
      maskedToken: token ? maskKey(token) : null,
      healthy: false,
      error: `无法连接后端：${(e as Error).message}`,
    };
  }
}

/** GET {relayUrl}/v1/health，带可选 Bearer Token */
async function fetchHealth(url: string, token: string): Promise<Response> {
  return fetch(`${url}/v1/health`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/** 按 origin 申请主机权限（optional_host_permissions，安装期不声明 <all_urls>） */
async function requestOriginPermission(origin: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    chrome.permissions.request({ origins: [`${origin}/*`] }, (granted) => {
      resolve(!!granted);
    });
  });
}

/** 地址脱敏（日志用）：保留协议与主机首段 */
function maskOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return '***';
  }
}
