/**
 * 音色提供方接口：每个 TTS 引擎独立实现「提供音色选项」与「提供默认音色」。
 *
 * 取代原先散在 background/index.ts 消息处理器里的 if/else 路由：引擎新增 /
 * 替换只改本目录的注册表，消息处理器与界面层零改动（AGENTS.md §0 原则 2：
 * 通过精简且稳定的接口封装内部复杂度）。合成侧（ttsSpeech）仍按引擎各成模块
 * （background/tts.ts / relay-tts.ts），音色提供与合成本就是两个正交职责。
 *
 * 界面层（popup / content）不感知此接口：仍只发 getPresetVoices 一个消息，
 * 由 background 按当前 provider 路由到对应实现（消息契约保持不变，§1.2）。
 */
import type { PresetVoice, TtsProvider } from '../../shared/types';

/**
 * 单个引擎的音色提供方：提供该引擎的音色目录。
 *
 * 音色目录同时决定了「默认音色」：pickDefaultVoice 在界面语言无匹配时
 * 回退到目录首个，因此各 provider 应把该引擎的默认音色排在目录首位
 * （MiMo 的首项是 MiMo-默认 / mimo_default 双语音色）。默认音色策略
 * 由目录内容承载，不需要额外方法（AGENTS.md §0 原则 1：不做推测性抽象）。
 */
export interface VoiceProvider {
  /** 引擎标识 */
  readonly provider: TtsProvider;
  /**
   * 提供该引擎的音色目录。
   *
   * @returns 成功返回音色数组；失败返回错误信息（由消息处理器转成响应，
   * 界面层按 isRetryableTtsError 的分类展示重试 / 错误态）
   */
  getVoices(): Promise<{ voices: PresetVoice[] } | { error: string }>;
}

/**
 * 引擎注册表：provider → 提供方实例。
 *
 * 新增引擎只需实现 VoiceProvider 并在此注册一行，消息处理器与界面层均不变。
 */
const providers: Partial<Record<TtsProvider, VoiceProvider>> = {};

/** 注册一个引擎的音色提供方 */
export function registerVoiceProvider(provider: TtsProvider, impl: VoiceProvider): void {
  providers[provider] = impl;
}

/** 读取当前引擎的音色提供方（未注册时返回 null，由调用方处理） */
export function resolveVoiceProvider(provider: TtsProvider): VoiceProvider | null {
  return providers[provider] || null;
}
