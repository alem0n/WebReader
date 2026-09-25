/**
 * 后端中转引擎的音色提供方：透传 tts-relay 的 /v1/voices 目录。
 *
 * 与 MiMo 不同：音色目录来自用户自部署的后端（网络请求）。默认音色同样由
 * 目录顺序决定（pickDefaultVoice 无匹配时取目录首个）——Edge 目录语种齐全，
 * 界面语言只有 en / zh_CN 两档，通常都能命中。
 *
 * 合成侧仍在 background/relay-tts.ts，本模块只管「提供选项」。
 * 逻辑自 relay-tts.ts 的 handleRelayVoices 迁移而来（原则 10：删除旧实现）。
 */
import type { PresetVoice, TtsProvider } from '../../shared/types';
import { getRelayToken, getRelayUrl } from '../relay-config';
import { logger } from '../log';
import type { VoiceProvider } from './voice-provider';

/** 后端音色列表响应体（与 tts-relay /v1/voices 对齐） */
interface RelayVoicesBody {
  ok: boolean;
  count?: number;
  voices?: PresetVoice[];
  message?: string;
}

export const relayVoiceProvider: VoiceProvider = {
  provider: 'relay' as TtsProvider,

  async getVoices() {
    const relayUrl = await getRelayUrl();
    if (!relayUrl) {
      return { error: '尚未配置后端中转地址' };
    }
    const relayToken = await getRelayToken();

    try {
      const response = await fetch(`${relayUrl}/v1/voices`, {
        method: 'GET',
        headers: relayToken ? { Authorization: `Bearer ${relayToken}` } : {},
      });
      if (!response.ok) {
        return { error: `后端返回 HTTP ${response.status}` };
      }
      const data = (await response.json()) as RelayVoicesBody;
      if (!data || !Array.isArray(data.voices)) {
        return { error: '后端音色列表格式无效' };
      }
      logger.debug(`relay voices loaded: ${data.voices.length}`);
      return { voices: data.voices };
    } catch (e) {
      return { error: `无法连接后端：${(e as Error).message}` };
    }
  },
};
