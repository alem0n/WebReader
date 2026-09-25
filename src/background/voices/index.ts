/**
 * 音色提供方注册入口：各引擎实现在此注册，消息处理器按 provider 路由。
 *
 * 新增引擎只需：实现 VoiceProvider → 在此注册一行。background/index.ts 的
 * getPresetVoices 处理器与界面层均不变（AGENTS.md §0 原则 2：开闭）。
 */
import type { TtsProvider } from '../../shared/types';
import { registerVoiceProvider, resolveVoiceProvider } from './voice-provider';
import { mimoVoiceProvider } from './mimo-voices';
import { relayVoiceProvider } from './relay-voices';

export type { VoiceProvider } from './voice-provider';
export { resolveVoiceProvider } from './voice-provider';

// 引擎注册表：provider → 提供方实例
registerVoiceProvider('mimo', mimoVoiceProvider);
registerVoiceProvider('relay', relayVoiceProvider);

/**
 * 按当前 provider 解析音色提供方（未注册时回退 MiMo，保持既有默认行为）。
 */
export function getVoiceProviderOrFallback(provider: TtsProvider) {
  return resolveVoiceProvider(provider) || mimoVoiceProvider;
}
