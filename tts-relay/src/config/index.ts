/**
 * 环境变量配置（可切换端点、并发、鉴权、TTL）。
 */
import type { EdgeEndpoint } from '../engines/edge/constants';

export interface RelayConfig {
  /** 监听端口 */
  port: number;
  /** 监听地址（本地开发 127.0.0.1；生产建议反代后 0.0.0.0 + https） */
  host: string;
  /** Bearer 鉴权 Token（空则不校验，仅本地开发） */
  relayAuthToken: string;
  /** Edge 端点：bing（权威）| msedgeservices（备选，微软迁移时切换） */
  edgeEndpoint: EdgeEndpoint;
  /** TrustedClientToken（与 Edge 读 aloud 接口一致） */
  trustedClientToken: string;
  /** Chromium 版本，影响 Sec-MS-GEC-Version */
  chromiumVersion: string;
  /** 输出格式 */
  outputFormat: string;
  /** 全局并发上限 */
  maxConcurrency: number;
  /** 单客户端并发上限 */
  maxPerClient: number;
  /** 排队上限（超出即拒绝，自保） */
  maxQueueSize: number;
  /** 音色目录 TTL（毫秒） */
  voicesTtlMs: number;
  /** 合成单次请求超时（毫秒） */
  synthTimeoutMs: number;
}

function envString(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): RelayConfig {
  return {
    port: envNumber('PORT', 8787),
    host: envString('HOST', '127.0.0.1'),
    relayAuthToken: envString('RELAY_AUTH_TOKEN', ''),
    edgeEndpoint: envString('EDGE_ENDPOINT', 'bing') === 'msedgeservices' ? 'msedgeservices' : 'bing',
    trustedClientToken: envString('EDGE_TRUSTED_CLIENT_TOKEN', '6A5AA1D4EAFF4E9FB37E23D68491D6F4'),
    chromiumVersion: envString('EDGE_CHROMIUM_VERSION', '143.0.3650.75'),
    outputFormat: envString('EDGE_OUTPUT_FORMAT', 'audio-24khz-48kbitrate-mono-mp3'),
    maxConcurrency: envNumber('MAX_CONCURRENCY', 4),
    maxPerClient: envNumber('MAX_PER_CLIENT', 2),
    maxQueueSize: envNumber('MAX_QUEUE_SIZE', 64),
    voicesTtlMs: envNumber('VOICES_TTL_MS', 24 * 60 * 60 * 1000),
    synthTimeoutMs: envNumber('SYNTH_TIMEOUT_MS', 60_000),
  };
}
