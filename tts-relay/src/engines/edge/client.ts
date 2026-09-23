/**
 * Edge 合成客户端：单段合成 = 一条短生命 WSS 连接（已实测）。
 *
 * 流程：建 WSS（muid cookie + Edge UA + Origin + permessage-deflate）
 *      → 发 Path:speech.config → 发 Path:ssml
 *      → 收集 Path:audio 载荷（偏移 2+H）→ 收到 Path:turn.end 结束
 *
 * 403 自愈：读响应头 Date 校准时钟偏差，重算令牌后最多重试 1 次
 * （等价于 edge-tts 的 DRM.handle_client_response_error）。
 */
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import type { EdgeEndpoints } from './constants';
import { EDGE_ORIGIN, EDGE_USER_AGENT } from './constants';
import { decodeBinaryFrame, encodeSpeechConfig, encodeSsmlFrame, getFramePath } from './frames';
import { SecMsGecToken } from './token';
import { buildSsml } from './ssml';
import type { RelayErrorCode } from '../../api/errors';

/** 连接级错误（供调用层区分：403 可重试，其它直接抛） */
export class EdgeConnectionError extends Error {
  readonly code: RelayErrorCode;
  readonly httpStatus?: number;
  /** 服务端响应头 Date（403 自愈：据此校准时钟偏差后重算令牌） */
  readonly serverDate?: string;

  constructor(message: string, code: RelayErrorCode, httpStatus?: number, serverDate?: string) {
    super(message);
    this.name = 'EdgeConnectionError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.serverDate = serverDate;
  }
}

export interface SynthesizeSegmentOptions {
  /** 已预处理的单段文本（已 XML 转义） */
  text: string;
  voice: string;
  speed?: number;
  outputFormat: string;
  /** 服务端响应头 Date，用于校准时钟偏差后重算令牌 */
  serverDate?: string | null;
}

export interface SynthesizeSegmentResult {
  audio: Uint8Array;
  /** 本段实际请求数（含 403 自愈重试） */
  attempts: number;
}

/** 生成握手所需 muid：随机 16 字节十六进制大写 */
function generateMuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

export class EdgeClient {
  private readonly token: SecMsGecToken;

  constructor(
    private readonly endpoints: EdgeEndpoints,
    private readonly trustedClientToken: string,
    private readonly chromiumVersion = '143.0.3650.75',
    /** 空闲超时：两帧之间最大间隔（毫秒）。Edge 流式分片，长段音频会持续到达 */
    private readonly idleTimeoutMs = 20_000
  ) {
    this.token = new SecMsGecToken(trustedClientToken);
  }

  /** 暴露令牌实例（音色列表接口共用同一令牌与时钟校正） */
  getToken(): SecMsGecToken {
    return this.token;
  }

  /** 单段合成：建 WSS → 发配置 → 发 ssml → 收帧拼装。403 时钟偏差自愈重试 1 次 */
  async synthesizeSegment(options: SynthesizeSegmentOptions): Promise<SynthesizeSegmentResult> {
    const maxAttempts = 2;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const audio = await this.synthesizeOnce(options);
        return { audio, attempts: attempt };
      } catch (error) {
        lastError = error;
        const connErr = error as EdgeConnectionError;
        // 只有鉴权类错误（403/401）才值得用校正后的时钟重算令牌重试一次
        const retryable = connErr?.code === 'UPSTREAM_AUTH';
        if (!retryable || attempt === maxAttempts) {
          throw error;
        }
        // 时钟偏差校正：用服务端 Date 重算后续令牌
        this.token.applyServerDate(connErr.serverDate);
      }
    }
    throw lastError;
  }

  /** 单次连接尝试（不重试） */
  private synthesizeOnce(options: SynthesizeSegmentOptions): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      const requestId = randomUUID().replace(/-/g, '');
      const connectionId = randomUUID().replace(/-/g, '');
      const gec = this.token.current().value;

      const url =
        this.endpoints.synthUrlBase +
        '?' +
        this.buildAuthQuery(gec) +
        `&ConnectionId=${connectionId}`;

      const ws = new WebSocket(url, {
        perMessageDeflate: true,
        headers: {
          'User-Agent': EDGE_USER_AGENT,
          Origin: EDGE_ORIGIN,
          Cookie: `muid=${generateMuid()};`,
        },
      });

      const chunks: Uint8Array[] = [];
      let settled = false;

      const finish = (err: unknown, audio?: Uint8Array) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        try {
          ws.close();
        } catch {
          /* already closed */
        }
        if (err) reject(err);
        else resolve(audio as Uint8Array);
      };

      // 空闲超时：Edge 是流式分片，长段音频会持续到达；只要还有帧就不算超时
      const idleTimeoutMs = this.idleTimeoutMs;
      const idleTimer = setTimeout(
        () => finish(new EdgeConnectionError(`Edge WSS 空闲超时（${idleTimeoutMs}ms 内无任何帧）`, 'TIMEOUT')),
        idleTimeoutMs
      );
      const kickIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer.refresh();
      };

      ws.on('open', () => {
        // 1) Path:speech.config
        ws.send(encodeSpeechConfig({ outputFormat: options.outputFormat, sentenceBoundaryEnabled: true }));
        // 2) Path:ssml
        ws.send(
          encodeSsmlFrame({
            requestId,
            ssml: buildSsml({ voice: options.voice, text: options.text, speed: options.speed }),
          })
        );
      });

      ws.on('message', (data, isBinary) => {
        if (settled) return;
        kickIdleTimer();
        if (isBinary) {
          const { headers, payload } = decodeBinaryFrame(data as Buffer);
          const path = headers.get('path');
          if (path === 'audio' && payload.length > 0) {
            chunks.push(payload);
          }
          return;
        }
        const text = data.toString();
        const path = getFramePath(text);
        if (path === 'turn.end') {
          const audio = concatBytes(chunks);
          if (audio.length === 0) {
            finish(new EdgeConnectionError('Edge 返回空音频（turn.end 无任何 audio 帧）', 'UPSTREAM_5XX'));
            return;
          }
          finish(null, audio);
        }
        // Path:response 可能携带错误信息，记录但不中断（turn.end 会结束）
      });

      ws.on('error', (error) => {
        kickIdleTimer();
        finish(new EdgeConnectionError(`Edge WSS 错误：${error.message}`, 'NETWORK'));
      });

      ws.on('unexpected-response', (_request, response) => {
        kickIdleTimer();
        const status: number = response.statusCode ?? 0;
        const serverDate = response.headers.date;
        response.resume();
        if (status === 401 || status === 403) {
          finish(
            new EdgeConnectionError(
              `Edge 握手被拒（HTTP ${status}）：时钟偏差或令牌失效`,
              'UPSTREAM_AUTH',
              status,
              serverDate
            )
          );
          return;
        }
        finish(new EdgeConnectionError(`Edge 握手失败：HTTP ${status}`, status >= 500 ? 'UPSTREAM_5XX' : 'BAD_GATEWAY', status));
      });

      ws.on('close', (code) => {
        kickIdleTimer();
        if (!settled) {
          finish(new EdgeConnectionError(`Edge WSS 连接被关闭（close code ${code ?? '无'}）`, 'NETWORK'));
        }
      });
    });
  }

  /** 构造鉴权查询串（按端点风格） */
  private buildAuthQuery(gec: string): string {
    const version = `1-${this.chromiumVersion}`;
    const authParam =
      this.endpoints.paramStyle === 'msedgeservices'
        ? `Ocp-Apim-Subscription-Key=${this.trustedClientToken}`
        : `TrustedClientToken=${this.trustedClientToken}`;
    return `${authParam}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${version}`;
  }
}

/** 拼装多个 Uint8Array（避免 Buffer.concat 溢出大数组的兼容写法） */
function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
