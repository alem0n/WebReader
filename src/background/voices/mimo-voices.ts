/**
 * MiMo 引擎的音色提供方：本地常量目录。
 *
 * 音色选项是硬编码常量（不走网络），合成侧在 background/tts.ts。目录首项为
 * MiMo-默认（mimo_default，中英双语），即该引擎的默认音色——界面层按界面语言
 * 匹配失败时由 pickDefaultVoice 回退到目录首个（双语兜底）。
 */
import type { TtsProvider } from '../../shared/types';
import { MIMO_PRESET_VOICES } from '../../shared/constants';
import type { VoiceProvider } from './voice-provider';

export const mimoVoiceProvider: VoiceProvider = {
  provider: 'mimo' as TtsProvider,

  getVoices() {
    return Promise.resolve({ voices: [...MIMO_PRESET_VOICES] });
  },
};
