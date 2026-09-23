/** TTS 合成：通过 background 代理调用 MiMo，返回音频 Blob */
import { sendToBackground } from './messaging';
import { base64ToBlob } from './blob';
import type { PresetVoice, TtsResponse, TtsErrorResponse } from './types';

/**
 * 合成错误：保留 status / code 往上传递，供重试层做错误分类。
 *
 * background 的 401（Key 无效/未配置）与 400 类请求错误属于永久错误，重试只会
 * 加剧限流并刷屏日志；超时 / 网络错误 / 429 / 5xx 才是瞬时错误，可有限重试。
 */
export class TtsSynthError extends Error {
  /** HTTP 状态码（background 代理回填） */
  readonly status?: number;
  /** 机器可读错误码：NO_API_KEY / TIMEOUT / NETWORK 等 */
  readonly code?: string;

  constructor(message: string, opts: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'TtsSynthError';
    this.status = opts.status;
    this.code = opts.code;
  }
}

/**
 * 判定错误是否可有限重试：只重试瞬时错误。
 * - TIMEOUT / NETWORK / ABORTED（超时与网络抖动）→ 可重试
 * - HTTP 429（限流）/ 5xx（服务端错误）→ 可重试
 * - 401（Key 无效/未配置）与其余 4xx（请求错误）→ 立即失败
 * - 未知错误（非 TtsSynthError）→ 不重试，避免对不可恢复错误空转
 */
export function isRetryableTtsError(err: unknown): boolean {
  if (!(err instanceof TtsSynthError)) return false;
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.code === 'ABORTED') return true;
  if (err.status === 429) return true;
  if (err.status !== undefined && err.status >= 500) return true;
  return false;
}

/**
 * 合成语音。voice 可传 PresetVoice 对象或音色名字字符串，
 * background 会统一解析为 MiMo voice id。失败时抛 TtsSynthError（带 status/code）。
 */
export async function synthesizeSpeech(text: string, voice: string | PresetVoice, speed = 1.0): Promise<Blob> {
  const bgResponse = await sendToBackground<TtsResponse>({
    action: 'ttsSpeech',
    text,
    voice,
    speed,
  });

  if (!bgResponse || !bgResponse.success) {
    const errResp = bgResponse as TtsErrorResponse | undefined;
    const status = errResp?.status;
    const code = errResp?.code;
    // 401（含未配置 Key）给出统一可操作文案，其余透传 background 的错误消息
    const message =
      status === 401
        ? 'MiMo API Key 无效或未配置。请点击扩展图标重新填写 API Key。'
        : errResp?.message || errResp?.error || 'Failed to synthesize speech';
    throw new TtsSynthError(message, { status, code });
  }

  return base64ToBlob(bgResponse.data, bgResponse.type);
}
