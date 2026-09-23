/**
 * Edge TTS 引擎常量（事实基准见 plan.md §二.5，已实测）。
 *
 * 端点做成可切换常量：微软在 edge-tts 7.2.1→7.2.8 之间于 bing 与
 * msedgeservices 之间来回横跳过 4 次。v1 只实现 bing（实测可用），
 * 但保留 msedgeservices 分支与端点切换开关，漂移时一行切换。
 */

export type EdgeEndpoint = 'bing' | 'msedgeservices';

export interface EdgeEndpoints {
  /** 合成 WSS 基址（不含查询串） */
  synthUrlBase: string;
  /** 音色列表 HTTPS 地址（不含查询串） */
  voicesUrl: string;
  /** 查询串鉴权参数风格：bing 用 TrustedClientToken，msedgeservices 用 Ocp-Apim-Subscription-Key */
  paramStyle: 'bing' | 'msedgeservices';
}

/** 权威端点（edge-tts 7.2.8 / 2026-09-22 实测可用） */
const BING_ENDPOINTS: EdgeEndpoints = {
  synthUrlBase: 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1',
  voicesUrl: 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list',
  paramStyle: 'bing',
};

/** 备选端点（微软迁移中，7.2.2/7.2.3/7.2.5 曾用；WSS 握手参数集不同，v1 不启用） */
const MSEDGESERVICES_ENDPOINTS: EdgeEndpoints = {
  synthUrlBase: 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1',
  voicesUrl: 'https://api.msedgeservices.com/tts/cognitiveservices/voices/list',
  paramStyle: 'msedgeservices',
};

export function resolveEndpoints(endpoint: EdgeEndpoint): EdgeEndpoints {
  return endpoint === 'msedgeservices' ? MSEDGESERVICES_ENDPOINTS : BING_ENDPOINTS;
}

/** TrustedClientToken（Edge 读 aloud 接口的公共令牌，edge-tts 同值） */
export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

/** 跟随 Chromium 版本，需定期更新（影响 Sec-MS-GEC-Version） */
export const DEFAULT_CHROMIUM_VERSION = '143.0.3650.75';

/** 默认输出格式：24kHz 48kbit mono mp3 */
export const DEFAULT_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** 输出格式 → MIME（直接返回原始字节，省 33% 流量） */
export const OUTPUT_FORMAT_MIME: Record<string, string> = {
  'audio-24khz-48kbitrate-mono-mp3': 'audio/mpeg',
  'audio-24khz-96kbitrate-mono-mp3': 'audio/mpeg',
  'audio-16khz-32kbitrate-mono-mp3': 'audio/mpeg',
  'audio-24khz-160kbitrate-mono-mp3': 'audio/mpeg',
  'audio-24khz-48kbitrate-mono-opus': 'audio/ogg',
  'audio-24khz-24kbitrate-mono-opus': 'audio/ogg',
  'riff-24khz-16bit-mono-pcm': 'audio/wav',
  'riff-16khz-16bit-mono-pcm': 'audio/wav',
  'riff-48khz-16bit-mono-pcm': 'audio/wav',
};

export function mimeForFormat(format: string): string {
  return OUTPUT_FORMAT_MIME[format] ?? 'audio/mpeg';
}

/** 握手必需的 User-Agent（Edge / Chromium 指纹） */
export const EDGE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

/** 握手必需的 Origin（Edge 扩展指纹） */
export const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

/** 单段文本的 UTF-8 字节上限（edge-tts 即每段开新连接） */
export const MAX_SEGMENT_BYTES = 4096;
