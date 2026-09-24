/**
 * 自动语言检测下的音色选择（开始播放与开关 / 加载恢复的公共入口）。
 *
 * 设计约束：state.selectedVoice 是「当前要使用的音色」的单一来源，音色列表
 * 加载完成且有正文后不为 null。autoDetectLanguage 只决定这个值由谁产生：
 * - 关闭 → 用户手选，selectedVoice 原样作为来源，检测不介入；
 * - 开启 → 按当前正文检测语言并匹配音色，检测结果**写入** selectedVoice
 *   （同时同步搜索框显示），使跳转等下游逻辑直接复用、不必重复检测。
 *
 * 抽出前，handlePlayPause / jumpToSentence / loadVoices 三处各写一份检测 +
 * 匹配逻辑且互相漂移（跳转那份缺了两道兜底，正是整页朗读点击跳转失效的原因）；
 * 其中「检测为空的脚本回退」与「无匹配音色回退 mimo_default」两道兜底沿用
 * 原 handlePlayPause 的语义。
 *
 * 放在 voices/ 而非 player/：它是「选音色」这一音色域职责，且被 loader 复用；
 * 若放 player/ 会让 voices 反向依赖 player。依赖方向保持 player → voices。
 */
import type { PresetVoice } from '../../shared/types';
import { state } from '../state';
import { detectLanguage } from '../../shared/detect-language';
import { formatVoiceName } from './format';
import { createContentLogger } from '../log';

const logger = createContentLogger('voices');

/**
 * 按当前正文选出要使用的音色，并在自动检测模式下把结果落实为单一来源：
 * - autoDetectLanguage 关闭 → 返回用户手选的 selectedVoice，无副作用；
 * - autoDetectLanguage 开启 → 检测语言并匹配音色；检测为空（如拉丁短文本）时
 *   按脚本回退（含汉字→zh-CN，否则 en-US）；检测到的语言没有匹配音色
 *   （MiMo 仅中英语色）时回退到默认音色。命中或回退都写入 selectedVoice
 *   并同步搜索框，失败时保留原 selectedVoice。
 *
 * 调用方约定：仅在已有正文时调用（空正文无检测意义，此时保留现有 selectedVoice）。
 */
export function resolveVoiceForText(text: string): PresetVoice | null {
  if (!state.autoDetectLanguage) {
    return state.selectedVoice;
  }

  const detectedLang = detectLanguage(text);
  // 检测为空（如拉丁短文本）时按脚本回退：含汉字→中文，否则英文
  const langToUse = detectedLang || (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text) ? 'zh-CN' : 'en-US');
  if (!langToUse) return state.selectedVoice;

  const langPrefix = langToUse.split('-')[0];
  const voicesForLang = state.allVoices.filter(
    (v) =>
      v.language &&
      (v.language === langToUse ||
        v.language.startsWith(langToUse + '-') ||
        (v.language.startsWith(langPrefix + '-') && !v.language.startsWith('fil-')))
  );

  let voice: PresetVoice | null = null;
  if (voicesForLang.length > 0) {
    voice = voicesForLang[0];
    logger.debug(
      `Using language: ${langToUse} (${detectedLang ? 'auto-detected' : 'interface fallback for short text'}), voice: ${voice.name}`
    );
  } else if (state.allVoices.length > 0) {
    // 检测到的语言没有匹配音色（MiMo 仅提供中英文音色），回退到默认音色（支持中英文）
    voice = state.allVoices.find((v) => v.voice === 'mimo_default') || state.allVoices[0];
    logger.debug(`Using language: ${langToUse} has no matching voice, falling back to: ${voice.name}`);
  }

  if (!voice) return state.selectedVoice;

  // 落实为单一来源：下游（点击跳转、下拉选中态、语言过滤）一律读 selectedVoice
  state.selectedVoice = voice;
  if (state.voiceSearchInput) {
    state.voiceSearchInput.value = formatVoiceName(voice);
  }
  return voice;
}
