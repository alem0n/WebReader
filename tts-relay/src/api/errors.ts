/**
 * 统一错误码（后端 → 扩展 TtsErrorResponse.code 映射，让扩展侧
 * isRetryableTtsError 零改动继续工作，见 plan.md §五 错误码映射表）。
 */
export type RelayErrorCode =
  | 'UPSTREAM_AUTH' // 令牌 / 鉴权失效 → 扩展映射 NO_API_KEY（统一可操作文案）
  | 'BAD_REQUEST' // 空文本 / 非法音色
  | 'RATE_LIMIT' // 限流
  | 'UPSTREAM_5XX' // 上游 5xx
  | 'TIMEOUT' // 超时
  | 'NETWORK' // 网络错误
  | 'BAD_GATEWAY'; // 网关错误

export interface RelayErrorDto {
  ok: false;
  code: RelayErrorCode;
  message: string;
  /** HTTP 状态码（供扩展侧回填 TtsErrorResponse.status） */
  status: number;
}

/** 后端错误码 → HTTP 状态码 */
export const ERROR_HTTP_STATUS: Record<RelayErrorCode, number> = {
  UPSTREAM_AUTH: 401,
  BAD_REQUEST: 400,
  RATE_LIMIT: 429,
  UPSTREAM_5XX: 502,
  TIMEOUT: 504,
  NETWORK: 502,
  BAD_GATEWAY: 502,
};

/** 后端错误码 → 是否值得客户端重试（与扩展 isRetryableTtsError 对齐） */
export const ERROR_RETRYABLE: Record<RelayErrorCode, boolean> = {
  UPSTREAM_AUTH: false,
  BAD_REQUEST: false,
  RATE_LIMIT: true,
  UPSTREAM_5XX: true,
  TIMEOUT: true,
  NETWORK: true,
  BAD_GATEWAY: true,
};

export function toErrorDto(code: RelayErrorCode, message: string): RelayErrorDto {
  return { ok: false, code, message, status: ERROR_HTTP_STATUS[code] };
}

/** 把任意未知错误归一为 RelayErrorCode（供 API 层兜底） */
export function classifyError(error: unknown): RelayErrorDto {
  const message = error instanceof Error ? error.message : String(error);
  const code = inferCode(message);
  return toErrorDto(code, message);
}

function inferCode(message: string): RelayErrorCode {
  if (/timeout|timed out|超时/i.test(message)) return 'TIMEOUT';
  if (/429|rate limit|限流/i.test(message)) return 'RATE_LIMIT';
  if (/401|403|auth|鉴权|令牌/i.test(message)) return 'UPSTREAM_AUTH';
  if (/BAD_REQUEST/i.test(message)) return 'BAD_REQUEST';
  if (/502|bad gateway/i.test(message)) return 'BAD_GATEWAY';
  if (/network|ECONN|fetch failed|网络/i.test(message)) return 'NETWORK';
  return 'UPSTREAM_5XX';
}
