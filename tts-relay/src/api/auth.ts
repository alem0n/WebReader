/**
 * Bearer 鉴权（单机可关）：RELAY_AUTH_TOKEN 未设置时跳过校验，仅本地开发用。
 *
 * Token 是凭据：日志只出脱敏值。
 */
import type { IncomingMessage } from 'node:http';

export interface AuthResult {
  ok: boolean;
  /** 客户端标识（限流队列的 key；未开鉴权时用 IP 兜底） */
  clientId: string;
  error?: string;
}

export function authenticate(request: IncomingMessage, authToken: string | undefined): AuthResult {
  // 未配置 Token：本地开发模式，放行（clientId 用来源 IP）
  if (!authToken || !authToken.trim()) {
    return { ok: true, clientId: getClientIp(request) };
  }

  const header = request.headers.authorization;
  if (!header) {
    return { ok: false, clientId: getClientIp(request), error: 'missing Authorization header' };
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return { ok: false, clientId: getClientIp(request), error: 'invalid Authorization scheme' };
  }
  if (token.trim() !== authToken.trim()) {
    return { ok: false, clientId: getClientIp(request), error: 'invalid token' };
  }
  return { ok: true, clientId: 'token' };
}

function getClientIp(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket.remoteAddress ?? 'unknown';
}

/** 脱敏展示 Token（日志用） */
export function maskToken(token: string | undefined): string {
  if (!token) return '(未配置，本地开发模式)';
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}
