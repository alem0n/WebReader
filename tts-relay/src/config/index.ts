/**
 * 环境变量 / 配置文件双来源的 RelayConfig 定义、默认值与归一化。
 *
 * 配置来源与优先级：环境变量（显式设置）> 配置文件 > 内置默认值。
 *
 * - 环境变量：服务器 / 容器部署沿用旧用法（见 README），显式设置时始终覆盖文件；
 * - 配置文件：托盘菜单改动落盘的持久化结果（二进制所在目录的 config.json）；
 * - 内置默认值：见 DEFAULT_CONFIG。
 *
 * 托盘改动直接作用于内存中的配置并立即落盘 + 重启服务；「重新加载配置」才会重读文件。
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

/** 内置默认值（配置文件与环境变量都未提供时使用） */
export const DEFAULT_CONFIG: RelayConfig = {
  port: 8787,
  host: '127.0.0.1',
  relayAuthToken: '',
  edgeEndpoint: 'bing',
  trustedClientToken: '6A5AA1D4EAFF4E9FB37E23D68491D6F4',
  chromiumVersion: '143.0.3650.75',
  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
  maxConcurrency: 4,
  maxPerClient: 2,
  maxQueueSize: 64,
  voicesTtlMs: 24 * 60 * 60 * 1000,
  synthTimeoutMs: 60_000,
};

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

/** 环境变量是否被显式设置（空串视为未设置，与旧实现一致） */
function envHas(key: string): boolean {
  const value = process.env[key];
  return value !== undefined && value !== '';
}

function stringOr(value: string | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return value < min || value > max ? fallback : value;
}

/**
 * 把「环境变量 + 配置文件覆盖层」合并为一份完整配置，并做归一化校验。
 *
 * 逐字段应用三级优先；非法值回退到默认值，保证坏的手改文件不会让进程起不来。
 */
export function resolveConfig(file: Partial<RelayConfig> | null): RelayConfig {
  const f = file ?? {};
  return normalizeConfig({
    port: envHas('PORT') ? envNumber('PORT', DEFAULT_CONFIG.port) : numberOr(f.port, DEFAULT_CONFIG.port),
    host: envHas('HOST') ? envString('HOST', DEFAULT_CONFIG.host) : stringOr(f.host, DEFAULT_CONFIG.host),
    relayAuthToken: envHas('RELAY_AUTH_TOKEN')
      ? envString('RELAY_AUTH_TOKEN', DEFAULT_CONFIG.relayAuthToken)
      : stringOr(f.relayAuthToken, DEFAULT_CONFIG.relayAuthToken),
    edgeEndpoint:
      (envHas('EDGE_ENDPOINT') ? envString('EDGE_ENDPOINT', '') : stringOr(f.edgeEndpoint, '')) === 'msedgeservices'
        ? 'msedgeservices'
        : 'bing',
    trustedClientToken: envHas('EDGE_TRUSTED_CLIENT_TOKEN')
      ? envString('EDGE_TRUSTED_CLIENT_TOKEN', DEFAULT_CONFIG.trustedClientToken)
      : stringOr(f.trustedClientToken, DEFAULT_CONFIG.trustedClientToken),
    chromiumVersion: envHas('EDGE_CHROMIUM_VERSION')
      ? envString('EDGE_CHROMIUM_VERSION', DEFAULT_CONFIG.chromiumVersion)
      : stringOr(f.chromiumVersion, DEFAULT_CONFIG.chromiumVersion),
    outputFormat: envHas('EDGE_OUTPUT_FORMAT')
      ? envString('EDGE_OUTPUT_FORMAT', DEFAULT_CONFIG.outputFormat)
      : stringOr(f.outputFormat, DEFAULT_CONFIG.outputFormat),
    maxConcurrency: envHas('MAX_CONCURRENCY')
      ? envNumber('MAX_CONCURRENCY', DEFAULT_CONFIG.maxConcurrency)
      : numberOr(f.maxConcurrency, DEFAULT_CONFIG.maxConcurrency),
    maxPerClient: envHas('MAX_PER_CLIENT')
      ? envNumber('MAX_PER_CLIENT', DEFAULT_CONFIG.maxPerClient)
      : numberOr(f.maxPerClient, DEFAULT_CONFIG.maxPerClient),
    maxQueueSize: envHas('MAX_QUEUE_SIZE')
      ? envNumber('MAX_QUEUE_SIZE', DEFAULT_CONFIG.maxQueueSize)
      : numberOr(f.maxQueueSize, DEFAULT_CONFIG.maxQueueSize),
    voicesTtlMs: envHas('VOICES_TTL_MS')
      ? envNumber('VOICES_TTL_MS', DEFAULT_CONFIG.voicesTtlMs)
      : numberOr(f.voicesTtlMs, DEFAULT_CONFIG.voicesTtlMs),
    synthTimeoutMs: envHas('SYNTH_TIMEOUT_MS')
      ? envNumber('SYNTH_TIMEOUT_MS', DEFAULT_CONFIG.synthTimeoutMs)
      : numberOr(f.synthTimeoutMs, DEFAULT_CONFIG.synthTimeoutMs),
  });
}

/** 归一化：钳制数值范围、收紧枚举与字符串字段，非法值回退默认 */
export function normalizeConfig(input: RelayConfig): RelayConfig {
  return {
    ...input,
    port: Number.isInteger(input.port) && input.port >= 1 && input.port <= 65535 ? input.port : DEFAULT_CONFIG.port,
    host: typeof input.host === 'string' && input.host.trim() ? input.host.trim() : DEFAULT_CONFIG.host,
    relayAuthToken: typeof input.relayAuthToken === 'string' ? input.relayAuthToken : '',
    edgeEndpoint: input.edgeEndpoint === 'msedgeservices' ? 'msedgeservices' : 'bing',
    trustedClientToken:
      typeof input.trustedClientToken === 'string' && input.trustedClientToken
        ? input.trustedClientToken
        : DEFAULT_CONFIG.trustedClientToken,
    chromiumVersion:
      typeof input.chromiumVersion === 'string' && input.chromiumVersion
        ? input.chromiumVersion
        : DEFAULT_CONFIG.chromiumVersion,
    outputFormat:
      typeof input.outputFormat === 'string' && input.outputFormat ? input.outputFormat : DEFAULT_CONFIG.outputFormat,
    maxConcurrency: clampInt(input.maxConcurrency, 1, 64, DEFAULT_CONFIG.maxConcurrency),
    maxPerClient: clampInt(input.maxPerClient, 1, 16, DEFAULT_CONFIG.maxPerClient),
    maxQueueSize: clampInt(input.maxQueueSize, 0, 1024, DEFAULT_CONFIG.maxQueueSize),
    voicesTtlMs: clampInt(input.voicesTtlMs, 0, 7 * 24 * 60 * 60 * 1000, DEFAULT_CONFIG.voicesTtlMs),
    synthTimeoutMs: clampInt(input.synthTimeoutMs, 1000, 600_000, DEFAULT_CONFIG.synthTimeoutMs),
  };
}
