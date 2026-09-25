/**
 * Relay TTS 客户端：fetch 用户后端 → 原始音频字节 → base64 data URL。
 *
 * 与 handleTTSSpeech 输出同一形状的 TtsResponse，下游 base64ToBlob /
 * audio-cache / sentence-player / web-audio-player 全部零改动。
 * 错误码按 plan.md §五 映射表对齐，让 isRetryableTtsError 零改动继续工作。
 */
import { RELAY_TTS_TIMEOUT_MS } from '../shared/constants';
import { detectAudioFormat } from '../shared/audio-format';
import type { PresetVoice, TtsResponse } from '../shared/types';
import { getRelayToken, getRelayUrl } from './relay-config';
import { logger } from './log';

/** ttsSpeech 请求体（与 background/tts.ts 同形状，由 index.ts 统一传入） */
export interface RelaySpeechRequest {
  text: string;
  voice: string | PresetVoice;
  speed?: number;
}

/** 后端音色列表响应体：已随音色加载迁移至 background/voices/relay-voices.ts */

interface RelayErrorBody {
  ok: false;
  code: string;
  message: string;
  status: number;
}

/**
 * 后端错误码 → 扩展 TtsErrorResponse 的映射（plan.md §五）。
 *
 * 让 isRetryableTtsError 继续按 status / code 判定，relay 链路的可重试语义
 * 与 MiMo 链路一致：429 / 5xx / TIMEOUT / NETWORK 重试，401 / 400 立即失败。
 */
function mapRelayError(body: RelayErrorBody): TtsResponse {
  switch (body.code) {
    case 'UPSTREAM_AUTH':
      // 上游鉴权失败（含时钟偏差未自愈）：统一成 NO_API_KEY 文案，可操作
      return {
        success: false,
        status: 401,
        code: 'NO_API_KEY',
        error: 'RELAY_UPSTREAM_AUTH',
        message: '后端上游鉴权失败：可能是时钟偏差或令牌过期，请检查后端服务。',
      };
    case 'BAD_REQUEST':
      return { success: false, status: 400, error: body.message || '请求参数无效' };
    case 'RATE_LIMIT':
      return { success: false, status: 429, code: 'RATE_LIMIT', error: body.message || '后端限流，请稍后重试' };
    case 'TIMEOUT':
      return { success: false, status: 504, code: 'TIMEOUT', error: body.message || '后端合成超时' };
    case 'NETWORK':
    case 'BAD_GATEWAY':
      return { success: false, status: 502, code: 'NETWORK', error: body.message || '后端网关错误' };
    case 'UPSTREAM_5XX':
      return { success: false, status: 503, code: 'UPSTREAM_5XX', error: body.message || '上游服务暂时不可用' };
    default:
      return { success: false, status: body.status || 500, error: body.message || '后端返回未知错误' };
  }
}

/** 字节数组转 base64（分块，避免 String.fromCharCode 栈溢出） */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    parts.push(String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]));
  }
  return btoa(parts.join(''));
}

/** 解析语音 id：PresetVoice 取 voice，字符串直接用 */
function resolveVoiceId(voice: string | PresetVoice | undefined): string {
  if (!voice) return '';
  return typeof voice === 'object' && voice.voice ? voice.voice : String(voice);
}

/**
 * 经后端中转合成。成功返回与 MiMo 链路同形状的 data URL 响应。
 */
export async function handleRelayTTS(request: RelaySpeechRequest, sendResponse: (response: TtsResponse) => void): Promise<void> {
  try {
    const { text, voice, speed = 1.0 } = request;

    if (!text || !String(text).trim()) {
      sendResponse({ success: false, error: 'Empty text' });
      return;
    }

    const relayUrl = await getRelayUrl();
    if (!relayUrl) {
      sendResponse({
        success: false,
        status: 401,
        code: 'NO_API_KEY',
        error: 'RELAY_NOT_CONFIGURED',
        message: '尚未配置后端中转地址，请先在「后端中转」面板填写。',
      });
      return;
    }
    const relayToken = await getRelayToken();

    const requestBody = {
      engine: 'edge',
      text: String(text),
      voice: resolveVoiceId(voice),
      speed,
      format: 'audio-24khz-48kbitrate-mono-mp3',
    };

    // 超时控制（后端内部已有多段编排，这里只做单次 HTTP 兜底）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RELAY_TTS_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${relayUrl}/v1/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(relayToken ? { Authorization: `Bearer ${relayToken}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const err = fetchError as Error;
      if (err.name === 'AbortError') {
        sendResponse({
          success: false,
          code: 'TIMEOUT',
          error: `Request timeout: 后端未在 ${RELAY_TTS_TIMEOUT_MS / 1000} 秒内响应`,
        });
        return;
      }
      sendResponse({ success: false, code: 'NETWORK', error: `无法连接后端：${err.message}` });
      return;
    }

    // 后端成功返回二进制音频（audio/mpeg 等），错误体一律是 JSON
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('application/json')) {
      // 解析后端统一错误体（sendJson 抛出的都是 application/json）
      let body: RelayErrorBody | null = null;
      try {
        body = (await response.json()) as RelayErrorBody;
      } catch {
        /* 非 JSON 错误体，走兜底 */
      }
      if (body && body.ok === false && body.code) {
        logger.warn(`Relay error code=${body.code} status=${body.status}`);
        sendResponse(mapRelayError(body));
        return;
      }
      const fallback = await response.text().catch(() => '');
      logger.warn(`Relay unexpected status=${response.status} ct=${contentType} body=${fallback.slice(0, 200)}`);
      sendResponse({
        success: false,
        status: response.status,
        code: response.status >= 500 ? 'UPSTREAM_5XX' : 'NETWORK',
        error: `后端返回 HTTP ${response.status}`,
      });
      return;
    }

    // 二进制音频：arrayBuffer → 探测格式 → data URL
    const buffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(buffer);
    if (audioBytes.length === 0) {
      sendResponse({ success: false, error: '后端返回了空音频（0 字节）' });
      return;
    }

    const fmt = detectAudioFormat(audioBytes);
    const mime = fmt.mime || 'audio/mpeg';
    logger.debug(`relay audio bytes=${audioBytes.length} detected=${fmt.desc} mime=${mime}`);

    sendResponse({
      success: true,
      data: `data:${mime};base64,${bytesToBase64(audioBytes)}`,
      type: mime,
      isBlob: true,
    });
  } catch (error) {
    logger.error('relay tts error:', error);
    sendResponse({
      success: false,
      code: 'NETWORK',
      error: (error as Error).message || 'Network error',
    });
  }
}
