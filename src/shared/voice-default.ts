/**
 * 默认音色派生：按界面语言选出默认音色（纯领域逻辑）。
 *
 * 取代原「按正文自动检测语言」的选音色方式：默认音色只由用户当前选择的界面
 * 语言决定，用户手选的音色优先于此派生值（见 content/voices/voice-selection
 * 与 popup/voices.ts 的 voiceSelectionIsManual）。本模块不持有任何层状态，
 * 音色目录与界面语言均由调用方传入（AGENTS.md §0.2 领域模型边界）。
 *
 * 界面语言只有 en / zh_CN 两档（见 _locales 与 language-select 的语言条），
 * 映射到音色主语言前缀；无匹配语种时回退到目录首个音色，即各引擎的默认
 * 音色（由 background/voices 的 VoiceProvider 保证排在首位，如 MiMo 的
 * mimo_default 双语音色）。决策见
 * docs/adr/0002-voice-default-from-interface-language.md。
 */
import type { PresetVoice } from './types';

/** 界面语言 → 音色主语言前缀（未知界面语言回退英文） */
const INTERFACE_LANG_TO_VOICE_LANG: Record<string, string> = {
  en: 'en',
  zh_CN: 'zh',
};

/** 界面语言对应的音色主语言前缀（如 zh_CN → 'zh'，未知 → 'en'） */
export function getVoiceLangForInterfaceLanguage(interfaceLanguage: string): string {
  return INTERFACE_LANG_TO_VOICE_LANG[interfaceLanguage] || 'en';
}

/**
 * 从音色目录中选出界面语言对应的默认音色。
 *
 * 兜底顺序：界面语言匹配的首个音色 → 目录首个音色（各引擎的默认音色，
 * 由 VoiceProvider 保证排在首位，如 MiMo 的 mimo_default 双语音色）
 * → 目录为空返回 null（音色尚未加载，调用方保留现状）。
 * 匹配按主语言前缀（zh 匹配 zh-CN / zh-TW，en 匹配 en-US / en-AU），
 * 不区分区域：界面语言本身不带区域信息。
 */
export function pickDefaultVoice(voices: PresetVoice[], interfaceLanguage: string): PresetVoice | null {
  if (!voices || voices.length === 0) return null;

  const prefix = getVoiceLangForInterfaceLanguage(interfaceLanguage).toLowerCase();

  const matched = voices.find((v) => {
    const lang = (v.language || '').toLowerCase();
    return lang === prefix || lang.startsWith(prefix + '-');
  });
  if (matched) return matched;

  // 无匹配语种：回退各引擎的默认音色（目录首个，由 VoiceProvider 排序保证）
  return voices[0];
}
