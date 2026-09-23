/** MiMo TTS 代理：调用 OpenAI 兼容的 chat/completions 并返回音频 data URL */
import { MIMO_API_URL, MIMO_MODEL, MIMO_PRESET_VOICES, MIMO_TTS_TIMEOUT_MS } from '../shared/constants';
import { base64ToBytes, bytesToHex, detectAudioFormat } from '../shared/audio-format';
import type { PresetVoice, TtsResponse } from '../shared/types';
import { getApiKey } from './api-key';
import { logger } from './log';

/** ttsSpeech 请求体 */
export interface TtsSpeechRequest {
  text: string;
  voice: string | PresetVoice;
  speed?: number;
}

/** MiMo chat/completions 消息（TTS 协议：文本在 assistant，风格指令在 user） */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 语音 ID：优先使用 voice id，兼容直接传名字 */
function resolveVoiceId(voice: string | PresetVoice | undefined): string {
  let voiceId = 'mimo_default';
  if (voice) {
    if (typeof voice === 'object' && voice.voice) {
      voiceId = voice.voice;
    } else {
      const matched = MIMO_PRESET_VOICES.find((v) => v.name === voice || v.voice === voice);
      voiceId = matched ? matched.voice : String(voice);
    }
  }
  return voiceId;
}

/** 界面可选语速 → 风格指令映射（MiMo 经 user 消息风格指令近似控制语速）
 * 键取实际下拉值；1.0 不下发指令，让模型用自然语速。 */
const SPEED_STYLE_HINTS: Record<number, string> = {
  0.5: '以正常语速的一半左右、非常缓慢沉稳地朗读。',
  0.75: '以比正常语速慢约四分之一、缓慢沉稳地朗读。',
  1.25: '以比正常语速快约四分之一、明快地朗读。',
  1.5: '以正常语速的 1.5 倍、较快明快地朗读。',
  1.75: '以正常语速的 1.75 倍、很快地朗读。',
  2: '以正常语速的 2 倍、极快地朗读。',
  2.5: '以正常语速的 2.5 倍、尽可能快地朗读。',
};

/** 语速映射为自然语言风格指令（MiMo 通过 user 消息控制风格/语速） */
function buildStyleHint(speed: number): string {
  // 非有限值或 1.0：不下发风格指令，避免干扰模型自然语速
  if (!Number.isFinite(speed) || Math.abs(speed - 1.0) < 1e-6) return '';
  // 精确匹配界面可选档位（取整消除浮点误差，如 2 而非 2.0000001）
  const exact = SPEED_STYLE_HINTS[Math.round(speed * 100) / 100];
  if (exact) return exact;
  // 兜底：未知档位按区间给出方向性指令
  if (speed < 0.9) return '以比正常语速慢、缓慢沉稳地朗读。';
  if (speed > 1.15) return '以比正常语速快、明快地朗读。';
  return '';
}

/** TTS synthesis via MiMo API */
export async function handleTTSSpeech(request: TtsSpeechRequest, sendResponse: (response: TtsResponse) => void): Promise<void> {
  try {
    const { text, voice, speed = 1.0 } = request;

    if (!text || !String(text).trim()) {
      sendResponse({ success: false, error: 'Empty text' });
      return;
    }

    // 获取当前 API Key（界面填写优先）
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({
        success: false,
        status: 401,
        code: 'NO_API_KEY',
        error: 'MIMO_API_KEY_NOT_SET',
        message: '未配置 MiMo API Key，请先填写。',
      });
      return;
    }

    const voiceId = resolveVoiceId(voice);
    const styleHint = buildStyleHint(speed);

    const messages: ChatMessage[] = [];
    if (styleHint) {
      messages.push({ role: 'user', content: styleHint });
    }
    messages.push({ role: 'assistant', content: String(text) });

    const requestBody = {
      model: MIMO_MODEL,
      messages,
      audio: {
        format: 'wav',
        voice: voiceId,
      },
    };

    // 超时控制（阈值与 shared 重试层共用同一常量，避免两处漂移）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, MIMO_TTS_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(MIMO_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if ((fetchError as Error).name === 'AbortError') {
        sendResponse({
          success: false,
          code: 'TIMEOUT',
          error: `Request timeout: MiMo server did not respond within ${MIMO_TTS_TIMEOUT_MS / 1000} seconds`,
        });
        return;
      }
      throw fetchError;
    }

    if (!response.ok) {
      let errorData: { error?: { message?: string } | string } = {};
      try {
        const text2 = await response.text();
        errorData = text2 ? JSON.parse(text2) : {};
      } catch {
        /* ignore parse errors */
      }
      logger.warn(`Failed status=${response.status}`, errorData);
      const err = errorData.error;
      const errMsg = typeof err === 'string' ? err : err?.message || `HTTP ${response.status}: ${response.statusText}`;
      sendResponse({ success: false, status: response.status, error: errMsg });
      return;
    }

    const data = await response.json();
    // OpenAI 兼容格式：音频 base64 在 choices[0].message.audio.data
    const audioData = data?.choices?.[0]?.message?.audio?.data;
    if (!audioData) {
      logger.warn('Response has no audio data. choices[0].message =', data?.choices?.[0]?.message);
      sendResponse({ success: false, error: 'No audio data in MiMo response' });
      return;
    }

    // 解码并探测真实格式，避免 MIME 与字节内容不匹配导致播放器无法解码
    let audioBytes: Uint8Array;
    try {
      audioBytes = base64ToBytes(audioData);
    } catch (e) {
      logger.warn('base64 decode failed:', (e as Error).message, 'raw head =', String(audioData).slice(0, 40));
      sendResponse({ success: false, error: 'MiMo 返回的音频数据无效（base64 解码失败）' });
      return;
    }

    const fmt = detectAudioFormat(audioBytes);
    const mime = fmt.mime || 'audio/wav'; // 探测失败时回退为 wav
    logger.debug(`audio bytes=${audioBytes.length} detected=${fmt.desc} mime=${mime} head=${bytesToHex(audioBytes)}`);

    if (audioBytes.length === 0) {
      sendResponse({ success: false, error: 'MiMo 返回了空音频（0 字节）' });
      return;
    }

    // 使用纯 base64（不含前缀），MIME 使用探测到的真实格式
    const audioStr = String(audioData);
    const pureBase64 = audioStr.includes(',') ? audioStr.slice(audioStr.indexOf(',') + 1) : audioStr;
    sendResponse({
      success: true,
      data: `data:${mime};base64,${pureBase64}`,
      type: mime,
      isBlob: true,
    });
  } catch (error) {
    logger.error('Error:', error);
    sendResponse({
      success: false,
      code: 'NETWORK',
      error: (error as Error).message || 'Network error',
    });
  }
}
