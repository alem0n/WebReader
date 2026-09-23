/**
 * Provider 解析：决定 ttsSpeech / getPresetVoices 走哪条链路。
 *
 * 单一事实源：provider 的读写在 shared/settings 实现，background / content / popup
 * 共用同一份，避免两层各读一份导致路由不一致。
 */
import { readTtsProvider, setProvider as persistProvider } from '../shared/settings';
import type { TtsProvider } from '../shared/types';

/** 读取当前 provider（存储缺失或非法值时回退默认 mimo，保持既有行为不变） */
export async function resolveProvider(): Promise<TtsProvider> {
  return readTtsProvider();
}

/** 写入 provider（切换时由 popup 调用） */
export async function setProvider(provider: TtsProvider): Promise<void> {
  await persistProvider(provider);
}
