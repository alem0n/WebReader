/**
 * 音色恢复判据：持久化设置 + 当前音色目录 → 要沿用的手选音色（或 null 表示重新派生）。
 *
 * 为什么需要独立判据（本次修复的历史背景）：
 * 旧版按正文自动检测语言，检测出的音色直接写入 selectedVoice 并落盘，但当时没有
 * 「是否用户手选」的标志。升级后若把这类残留音色当手选恢复，中文界面会显示英文
 * 音色（残留的 Mia 顶替了按界面语言派生的 MiMo-默认）。修复引入持久化标志
 * voiceSelectionIsManual 作为「这个 selectedVoice 是不是用户真手选」的唯一判据：
 * 缺标志或为 false → 非手选 → 恢复 null，调用方按界面语言重新派生；显式 true 且
 * 音色仍在当前目录内 → 沿用。旧数据在下次保存时被以正确标志覆写，一次性自愈。
 *
 * 纯函数（AGENTS.md §0.2 领域模型）：不持有层状态，入参为持久化设置与音色目录，
 * 出参为音色或 null。content loader 与 popup voices 共用同一份判据，避免两层漂移。
 */
import type { PresetVoice, ExtensionSettings } from './types';

/**
 * 判断持久化的 selectedVoice 是否应作为用户手选沿用。
 *
 * @param settings 持久化设置（含 selectedVoice 与 voiceSelectionIsManual）
 * @param voices 当前已加载的音色目录（手选音色必须仍在目录内才能恢复）
 * @returns 要沿用的手选音色；null 表示应按界面语言重新派生
 */
export function resolveRestoredVoice(settings: Partial<ExtensionSettings>, voices: PresetVoice[]): PresetVoice | null {
  if (!settings || settings.voiceSelectionIsManual !== true) return null;
  const savedName = settings.selectedVoice || null;
  if (!savedName || !voices || voices.length === 0) return null;
  return voices.find((v) => v.name === savedName) || null;
}
