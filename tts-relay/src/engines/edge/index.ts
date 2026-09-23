/**
 * Edge 引擎门面：文本预处理 → 多段编排（每段一条 WSS）→ 拼装完整音频。
 *
 * 这是 provider 特有逻辑的落点：语速映射、SSML、帧协议、端点切换都在本目录内，
 * 不污染其它 provider，也不下沉到扩展 shared（plan.md §六）。
 */
import { MAX_SEGMENT_BYTES, type EdgeEndpoint, mimeForFormat, resolveEndpoints } from './constants';
import { EdgeClient } from './client';
import { prepareTextForSynthesis } from './text';
import type { EdgeVoiceListEntry, VoiceCatalogEntry } from './voices';
export interface SynthesizeInput {
  text: string;
  voice: string;
  speed?: number;
}

export interface SynthesizeOutput {
  /** 完整音频字节（多段顺序拼装） */
  audio: Uint8Array;
  /** MIME（由输出格式决定，直接返回原始字节） */
  mimeType: string;
  /** 切成的段数（每段一条 WSS 连接） */
  segments: number;
  /** 含 403 自愈重试的总请求数 */
  attempts: number;
}

export class EdgeEngine {
  private readonly client: EdgeClient;
  private readonly endpoints;

  constructor(
    endpoint: EdgeEndpoint = 'bing',
    private readonly trustedClientToken: string,
    private readonly chromiumVersion = '143.0.3650.75',
    private readonly outputFormat = 'audio-24khz-48kbitrate-mono-mp3',
    private readonly idleTimeoutMs = 20_000
  ) {
    this.endpoints = resolveEndpoints(endpoint);
    this.client = new EdgeClient(this.endpoints, this.trustedClientToken, this.chromiumVersion, this.idleTimeoutMs);
  }

  /** 暴露音色模块需要的令牌与端点信息 */
  getClient(): EdgeClient {
    return this.client;
  }

  getVoicesUrl(): string {
    return this.endpoints.voicesUrl;
  }

  /** 合成：控制字符清洗 + XML 转义 + 4096 字节切段，每段一条短连接 */
  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const { text, voice, speed } = input;
    if (!text || !String(text).trim()) {
      throw new Error('BAD_REQUEST: text must not be empty');
    }
    if (!voice || !String(voice).trim()) {
      throw new Error('BAD_REQUEST: voice must not be empty');
    }

    const segments = prepareTextForSynthesis(String(text), MAX_SEGMENT_BYTES);
    if (segments.length === 0) {
      throw new Error('BAD_REQUEST: text is empty after preprocessing');
    }

    const parts: Uint8Array[] = [];
    let attempts = 0;
    for (const segment of segments) {
      const result = await this.client.synthesizeSegment({
        text: segment,
        voice: String(voice),
        speed,
        outputFormat: this.outputFormat,
      });
      parts.push(result.audio);
      attempts += result.attempts;
    }

    return {
      audio: concatBytes(parts),
      mimeType: mimeForFormat(this.outputFormat),
      segments: segments.length,
      attempts,
    };
  }
}

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

/** 音色条目（转成扩展侧 PresetVoice 形状） */
export type { VoiceCatalogEntry, EdgeVoiceListEntry };
