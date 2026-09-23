/**
 * Edge 私有帧协议编解码（已实测）。
 *
 * 消息序列（Path 全小写，文本帧）：
 *   → TEXT  Path:speech.config   输出格式等配置
 *   → TEXT  Path:ssml            合成请求
 *   ← TEXT  Path:turn.start / Path:response / Path:audio.metadata / Path:turn.end
 *   ← BIN   Path:audio           二进制音频帧
 *
 * 二进制帧切片（最容易写错的一步）：
 *   [0:2]       头长度 H（大端）
 *   [2 : 2+H]   头文本，每行以 \r\n 结尾
 *   [2+H : ]    音频载荷  ← 载荷起点恰在 2+H，不是 2+H+2
 */

export type FramePath =
  | 'speech.config'
  | 'ssml'
  | 'turn.start'
  | 'response'
  | 'audio.metadata'
  | 'turn.end'
  | 'audio'
  | string;

/** 头字段的分隔符 */
const HEADER_LINE_END = '\r\n';
const HEADER_KV_SEP = ':';

/** 把文本帧的头解析为键值对 */
export function parseTextFrameHeaders(headerText: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of headerText.split(HEADER_LINE_END)) {
    if (!line) continue;
    const sepIdx = line.indexOf(HEADER_KV_SEP);
    if (sepIdx < 0) continue;
    const key = line.slice(0, sepIdx).trim().toLowerCase();
    const value = line.slice(sepIdx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

/** 从文本帧中取 Path（大小写敏感，协议要求全小写） */
export function getFramePath(headerText: string): FramePath | null {
  const headers = parseTextFrameHeaders(headerText);
  return headers.get('path') ?? null;
}

export interface DecodedBinaryFrame {
  /** 头文本（诊断用） */
  headerText: string;
  /** 头键值对 */
  headers: Map<string, string>;
  /** 音频载荷（起点 = 2 + 头长度） */
  payload: Uint8Array;
}

/**
 * 解析二进制帧。
 *
 * @param data 完整的 WebSocket 二进制消息
 * @returns 头与载荷；载荷为空时表示这是无音频的帧（如 turn.start）
 */
export function decodeBinaryFrame(data: ArrayBuffer | Buffer | Uint8Array): DecodedBinaryFrame {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 2) {
    return { headerText: '', headers: new Map(), payload: new Uint8Array(0) };
  }
  const headerLength = (bytes[0] << 8) | bytes[1];
  const headerEnd = Math.min(2 + headerLength, bytes.length);
  const headerText = new TextDecoder().decode(bytes.subarray(2, headerEnd));
  const payload = bytes.subarray(headerEnd);
  return { headerText, headers: parseTextFrameHeaders(headerText), payload };
}

// ------------------------------------------------------------------
// 编码（发送侧）

export interface SpeechConfigOptions {
  outputFormat: string;
  sentenceBoundaryEnabled?: boolean;
  wordBoundaryEnabled?: boolean;
}

/** 编码 Path:speech.config 文本帧 */
export function encodeSpeechConfig(options: SpeechConfigOptions): string {
  const body = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: String(!!options.sentenceBoundaryEnabled),
            wordBoundaryEnabled: String(!!options.wordBoundaryEnabled),
          },
          outputFormat: options.outputFormat,
        },
      },
    },
  });
  return encodeTextFrame('speech.config', body, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Timestamp': new Date().toISOString(),
  });
}

export interface SsmlFrameOptions {
  requestId: string;
  ssml: string;
  contentType?: string;
}

/** 编码 Path:ssml 文本帧 */
export function encodeSsmlFrame(options: SsmlFrameOptions): string {
  return encodeTextFrame('ssml', options.ssml, {
    'X-RequestId': options.requestId,
    'Content-Type': options.contentType ?? 'application/ssml+xml',
    'X-Timestamp': new Date().toISOString(),
  });
}

/** 通用文本帧编码：头每行以 \r\n 结尾，头与体之间一个空行 */
export function encodeTextFrame(path: string, body: string, headers: Record<string, string> = {}): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`${key}:${value}`);
  }
  lines.push(`Path:${path}`);
  // 头块须以 \r\n\r\n 结尾：一个终止最后一行，一个作为头体分隔的空行
  return lines.join(HEADER_LINE_END) + HEADER_LINE_END + HEADER_LINE_END + body;
}
