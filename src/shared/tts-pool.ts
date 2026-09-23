/**
 * 合成调用层：有限重试 + 全局并发协调（plan.md 阶段 2）。
 *
 * 借鉴 kiss-translator libs/pool.js 的「并发上限 + 最小启动间隔」思想，但按 TTS
 * 场景调整：重试放在合成调用层（而非把失败任务 unshift 回聚合队列），使预取
 * （AudioCacheManager._doSynth）与按需（ensure）两条路径都受益。
 *
 * 错误分类见 ./tts.ts：只重试瞬时错误（超时 / 网络 / 429 / 5xx），
 * 401（Key 无效）与 400 类请求错误立即失败，避免重试加剧 MiMo 限流、刷屏日志。
 */
import { synthesizeSpeech, TtsSynthError, isRetryableTtsError } from './tts';
import type { PresetVoice, TtsProvider } from './types';
import { MIMO_TTS_TIMEOUT_MS, PROVIDER_PROFILES } from './constants';
import { createLogger } from './log';
import { sleep, withTimeout } from './utils';

const logger = createLogger('WebReader/tts-pool');

/** 重试退避基数（毫秒）：500 → 1000 → 2000 */
const RETRY_BASE_DELAY = 500;

/**
 * 合成调用限流器：并发上限 + 最小启动间隔。
 *
 * 参数按 provider 取值（plan.md §五）：MiMo 直连保守，避免打满限流；
 * relay 走用户自部署后端，可放宽并发。限流器实例在首次使用时按当时 provider 固定参数，
 * 切换 provider 后进程内新连接自然套用新参数（本扩展场景下切换频率极低，无需动态重建）。
 */
class SynthLimiter {
  private active = 0;
  private lastStart = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly maxConcurrency: number;
  private readonly minInterval: number;

  constructor(provider: TtsProvider = 'mimo') {
    const profile = PROVIDER_PROFILES[provider];
    this.maxConcurrency = profile.maxConcurrency;
    this.minInterval = profile.minInterval;
  }

  /** 申请一个合成槽位：并发达上限时排队等待，并强制最小启动间隔 */
  async acquire(): Promise<void> {
    if (this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    this.active++;
    const wait = this.minInterval - (Date.now() - this.lastStart);
    if (wait > 0) {
      await sleep(wait);
    }
    this.lastStart = Date.now();
  }

  /** 释放槽位并唤醒下一个等待者 */
  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}

const limiters = new Map<TtsProvider, SynthLimiter>();
function getLimiter(provider: TtsProvider): SynthLimiter {
  let limiter = limiters.get(provider);
  if (!limiter) {
    limiter = new SynthLimiter(provider);
    limiters.set(provider, limiter);
  }
  return limiter;
}

/** 把任意错误归一为 TtsSynthError，便于统一分类（withTimeout 抛的是普通 Error） */
function normalizeSynthError(err: unknown): TtsSynthError {
  if (err instanceof TtsSynthError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  const isTimeout = /timeout|timed out|超时/i.test(message);
  return new TtsSynthError(message, { code: isTimeout ? 'TIMEOUT' : undefined });
}

/**
 * 带有限重试与并发协调的合成调用：预取与按需两条路径共用。
 *
 * - 只重试瞬时错误（超时 / 网络 / 429 / 5xx），401 与 400 类立即失败
 * - 重试次数封顶 MAX_RETRY 并指数退避
 * - 全部合成调用经共享限流器，统一并发上限与最小启动间隔
 * - background 侧已有 MIMO_TTS_TIMEOUT_MS 超时；此处再兜一层同样阈值 +5s，
 *   background 卡死无响应时生产者不会永久挂起（协作而非另起炉灶）
 */
export async function synthesizeWithRetry(
  text: string,
  voice: string | PresetVoice,
  speed = 1.0,
  provider: TtsProvider = 'mimo'
): Promise<Blob> {
  const profile = PROVIDER_PROFILES[provider];
  const maxRetry = profile.maxRetry;
  const limiter = getLimiter(provider);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    await limiter.acquire();
    try {
      return await withTimeout(
        () => synthesizeSpeech(text, voice, speed),
        MIMO_TTS_TIMEOUT_MS + 5000,
        provider === 'relay' ? '后端中转合成请求超时' : 'MiMo 合成请求超时'
      );
    } catch (err) {
      lastError = err;
      const normalized = normalizeSynthError(err);
      const retryable = isRetryableTtsError(normalized);
      // 永久错误（401/400）或已达重试上限：立即抛出，不重试
      if (!retryable || attempt === maxRetry) {
        throw normalized;
      }
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
      logger.warn(
        `合成失败（第 ${attempt + 1}/${maxRetry + 1} 次，${delay}ms 后重试）：`,
        normalized.message,
        normalized.status !== undefined ? `status=${normalized.status}` : '',
        normalized.code ? `code=${normalized.code}` : ''
      );
      await sleep(delay);
    } finally {
      limiter.release();
    }
  }

  throw normalizeSynthError(lastError);
}
