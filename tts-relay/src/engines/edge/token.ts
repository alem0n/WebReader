/**
 * Sec-MS-GEC 令牌（已实测通过）。
 *
 * 算法既不是 JWT、也不用 HMAC：就是 SHA256( str(ticks) + TrustedClientToken )
 * 的大写十六进制摘要。ticks 为 Windows 100 纳秒刻度，向下取整到 5 分钟窗口。
 *
 * 403 的首要原因是时钟偏差（不是算法变更）。自愈手段：读 403 响应头 Date，
 * 算出与服务端的偏差并校正本地时钟，重算令牌后由调用层重试 1 次。
 */
import { createHash } from 'node:crypto';

/** Unix(1970) → Windows 纪元(1601) 的秒偏移 */
const EPOCH_OFFSET_SECONDS = 11644473600;
/** 令牌有效期窗口（秒）：5 分钟 */
const TOKEN_WINDOW_SECONDS = 300;
/** 1 秒 = 1e7 个 100ns 刻度（用 BigInt 避免 1.34e17 超出 JS 安全整数） */
const TICKS_PER_SECOND = 10_000_000n;

export interface GeneratedToken {
  /** 当前 5 分钟窗口起点（服务端时钟空间的 Unix 秒） */
  windowStart: number;
  /** Sec-MS-GEC 值（大写十六进制） */
  value: string;
}

export class SecMsGecToken {
  private cached: GeneratedToken | null = null;
  /** 本地时钟相对服务端时钟的偏差（秒）：服务端 - 本地；403 时由服务端 Date 头校正 */
  private clockOffsetSeconds = 0;

  constructor(private readonly trustedClientToken: string) {}

  /** 计算指定 Unix 秒所属窗口的令牌（ ticks 必须先取整到窗口，避免窗口内漂移） */
  private computeFor(unixSeconds: number): GeneratedToken {
    // Unix(1970) → Windows 纪元(1601)，再向下取整到 5 分钟窗口
    const windowsTicks = unixSeconds + EPOCH_OFFSET_SECONDS;
    const windowStart = windowsTicks - (windowsTicks % TOKEN_WINDOW_SECONDS);
    const ticks = BigInt(windowStart) * TICKS_PER_SECOND;
    const value = createHash('sha256')
      .update(ticks.toString() + this.trustedClientToken)
      .digest('hex')
      .toUpperCase();
    return { windowStart, value };
  }

  /** 取当前窗口令牌：同窗口内复用缓存，跨窗口自动重算（令牌最多活 5 分钟） */
  current(): GeneratedToken {
    const nowServerSpace = Math.floor(Date.now() / 1000) + this.clockOffsetSeconds;
    const generated = this.computeFor(nowServerSpace);
    if (this.cached && this.cached.windowStart === generated.windowStart) {
      return this.cached;
    }
    this.cached = generated;
    return generated;
  }

  /** 强制重算（用于测试或手动失效） */
  invalidate(): void {
    this.cached = null;
  }

  /** 403 时按服务端响应头 Date 校准时钟偏差并使缓存失效，下次 current() 即用新窗口令牌 */
  applyServerDate(dateHeader: string | undefined | null): void {
    if (!dateHeader) return;
    const serverMs = Date.parse(dateHeader);
    if (Number.isNaN(serverMs)) return;
    const serverSeconds = Math.floor(serverMs / 1000);
    const localSeconds = Math.floor(Date.now() / 1000);
    this.clockOffsetSeconds = serverSeconds - localSeconds;
    this.cached = null;
  }

  /** 当前时钟偏差（秒），诊断日志用 */
  get clockOffset(): number {
    return this.clockOffsetSeconds;
  }
}
