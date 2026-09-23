/** 全局常量：MiMo API 配置、预置音色 */
import type { PresetVoice, TtsProvider } from './types';

/** MiMo TTS 端点（OpenAI 兼容协议） */
export const MIMO_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';

/** MiMo TTS 模型 */
export const MIMO_MODEL = 'mimo-v2.5-tts';

/**
 * 硬编码后备 API Key（可选）。
 * 优先使用扩展界面中填写的 Key（chrome.storage.local），留空则完全依赖界面填写。
 */
export const MIMO_API_KEY = '';

/** API Key 在 chrome.storage.local 中的键 */
export const MIMO_API_KEY_STORAGE = 'mimo_api_key';

/** 后端中转地址在 chrome.storage.local 中的键 */
export const RELAY_URL_STORAGE = 'relay_url';

/** 后端中转 Token 在 chrome.storage.local 中的键（与 api-key 同级凭据管理） */
export const RELAY_TOKEN_STORAGE = 'relay_token';

/** TTS 提供方设置在 chrome.storage.local 中的键 */
export const TTS_PROVIDER_STORAGE = 'tts_provider';

/** 默认 provider：未配置时走 MiMo 直连，保持既有行为不变 */
export const DEFAULT_TTS_PROVIDER: TtsProvider = 'mimo';

/** relay 合成请求超时（毫秒）。后端内部已有多段编排，扩展侧只做单次 HTTP 兜底 */
export const RELAY_TTS_TIMEOUT_MS = 120_000;

/** 各 provider 的并发 / 重试 / 限流参数（供 tts-pool 按取值，默认沿用现值） */
interface ProviderProfile {
  /** 并发上限 */
  maxConcurrency: number;
  /** 最小启动间隔（毫秒） */
  minInterval: number;
  /** 最大重试次数 */
  maxRetry: number;
}

export const PROVIDER_PROFILES: Record<TtsProvider, ProviderProfile> = {
  // MiMo 直连：维持现状，避免突发并发打满限流
  mimo: { maxConcurrency: 2, minInterval: 250, maxRetry: 2 },
  // 后端中转：用户自部署，可适当放宽并发；重试交给后端与现有逻辑共同兜底
  relay: { maxConcurrency: 4, minInterval: 120, maxRetry: 2 },
};

/**
 * MiMo 合成请求超时（毫秒）。
 * background 的 fetch AbortController 与 shared 重试层的兜底超时共用同一常量，
 * 避免两处超时阈值漂移（plan.md 阶段 2）。
 */
export const MIMO_TTS_TIMEOUT_MS = 60_000;

/** MiMo 预置音色（voice id 直接作为 audio.voice 传入） */
export const MIMO_PRESET_VOICES: PresetVoice[] = [
  { name: 'MiMo-默认', voice: 'mimo_default', language: 'zh-CN' },
  { name: '冰糖', voice: '冰糖', language: 'zh-CN' },
  { name: '茉莉', voice: '茉莉', language: 'zh-CN' },
  { name: '苏打', voice: '苏打', language: 'zh-CN' },
  { name: '白桦', voice: '白桦', language: 'zh-CN' },
  { name: 'Mia', voice: 'Mia', language: 'en-US' },
  { name: 'Chloe', voice: 'Chloe', language: 'en-US' },
  { name: 'Milo', voice: 'Milo', language: 'en-US' },
  { name: 'Dean', voice: 'Dean', language: 'en-US' },
];
