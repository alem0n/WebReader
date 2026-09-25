/** 全局共享类型定义：消息契约、音色、设置等 */

/** TTS 提供方：mimo（直连 MiMo OpenAI 兼容接口）| relay（用户自部署的后端中转） */
export type TtsProvider = 'mimo' | 'relay';

/** MiMo 预置音色 */
export interface PresetVoice {
  /** 界面显示名 */
  name: string;
  /** 传给 MiMo API audio.voice 的 voice id */
  voice: string;
  /** 语言代码，如 zh-CN / en-US */
  language: string;
  /**
   * 音色性别标注：MiMo 预置音色不填；relay 音色由后端 /v1/voices 的 Gender 填充，
   * 供 content/voices.ts 与 popup/voices.ts 展示与搜索过滤
   */
  gender?: string;
}

/** popup/content 保存到 storage 的设置 */
export interface ExtensionSettings {
  selectedVoice: string | null;
  /**
   * selectedVoice 是否为用户手选（区别于旧版自动检测落盘的残留）。
   *
   * 历史背景：旧版按正文自动检测语言，检测出的音色直接写入
   * selectedVoice 并落盘。升级后恢复逻辑若把它当手选恢复，会顶掉按界面
   * 语言派生的默认音色（中文界面却恢复英文音色）。新增此标志作为「这个
   * selectedVoice 是不是用户真手选」的唯一判据，旧数据缺标志时按界面语言
   * 重新派生，并在下次保存时以正确的标志值覆写，完成一次性自愈迁移。
   */
  voiceSelectionIsManual?: boolean;
  removeParentheticals: boolean;
  playbackSpeed: number;
  voicePanelControlsCollapsed: boolean;
  /** 网页内逐句高亮：整页朗读时在原位高亮当前朗读的句子（仅 content 侧管理） */
  inlineDisplayEnabled?: boolean;
  /** 朗读时自动滚动页面：把高亮句带到视口中部（关闭后只高亮不滚动，不动浏览器滚动条；仅 content 侧管理） */
  autoScrollEnabled?: boolean;
  /** TTS 提供方（mimo / relay），默认 mimo。切换 provider 时由 background 读取做路由 */
  ttsProvider?: TtsProvider;
}

/** localStorage 后备存储键（chrome.storage.local 不可用时） */
export const LOCAL_STORAGE_SETTINGS_KEY = 'tts-settings';

/** 发往 background 的消息（判别联合） */
export type BackgroundMessage =
  | { action: 'ttsSpeech'; text: string; voice: string | PresetVoice; speed: number }
  | { action: 'toggleWidgetOnActiveTab' }
  | { action: 'checkApiKeyStatus' }
  | { action: 'saveApiKey'; apiKey: string }
  | { action: 'getPresetVoices' }
  | { action: 'loadI18nMessages'; locale: string }
  | { action: 'saveRelayConfig'; url: string; token?: string }
  | { action: 'checkRelayStatus' }
  | { action: 'switchProvider'; provider: TtsProvider }
  | { action: 'readEntirePageOnActiveTab' }
  | { action: 'playTextOnActiveTab'; text: string };

/* ------------------------------------------------------------------ */
/** ttsSpeech 成功响应 */
interface TtsSuccessResponse {
  success: true;
  /** data URL（data:<mime>;base64,<...>） */
  data: string;
  /** 音频 MIME */
  type: string;
  isBlob: boolean;
}

/** ttsSpeech 失败响应 */
export interface TtsErrorResponse {
  success: false;
  error: string;
  status?: number;
  /** 机器可读错误码：NO_API_KEY / TIMEOUT / NETWORK 等，供错误分类决定是否重试 */
  code?: string;
  message?: string;
}

export type TtsResponse = TtsSuccessResponse | TtsErrorResponse;

/** checkApiKeyStatus 响应 */
export interface ApiKeyStatusResponse {
  success: boolean;
  hasKey?: boolean;
  maskedKey?: string | null;
  error?: string;
}

/** saveApiKey 响应 */
export interface SaveApiKeyResponse {
  success: boolean;
  maskedKey?: string;
  error?: string;
}

/** getPresetVoices 响应 */
export interface PresetVoicesResponse {
  success: boolean;
  voices?: PresetVoice[];
  error?: string;
}

/** loadI18nMessages 响应 */
export interface I18nMessagesResponse {
  success: boolean;
  messages?: Record<string, string>;
  error?: string;
}

/** toggleWidgetOnActiveTab 响应 */
export interface ToggleWidgetResponse {
  success: boolean;
  error?: string;
}

/** saveRelayConfig / checkRelayStatus 响应 */
export interface RelayConfigResponse {
  success: boolean;
  /** 后端中转地址（已配置时返回，供界面回填） */
  url?: string | null;
  /** 脱敏 Token */
  maskedToken?: string | null;
  /** 连通性自检结果（checkRelayStatus 时携带） */
  healthy?: boolean;
  /** 后端报告的引擎列表 */
  engines?: string[];
  /** 上游延迟（毫秒） */
  upstreamLatencyMs?: number;
  /** 诊断信息：后端起来但上游不可达时携带，供界面分级引导 */
  upstreamError?: string;
  error?: string;
}

/** background 统一响应类型 */
export type BackgroundResponse =
  | TtsResponse
  | ApiKeyStatusResponse
  | SaveApiKeyResponse
  | PresetVoicesResponse
  | I18nMessagesResponse
  | ToggleWidgetResponse
  | RelayConfigResponse;
