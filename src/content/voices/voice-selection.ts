/**
 * 音色选择：用户手选优先，否则按界面语言派生默认音色。
 *
 * 设计约束：state.selectedVoice 是「当前要使用的音色」的单一来源，音色列表
 * 加载完成后不为 null。voiceSelectionIsManual 只决定这个值由谁产生：
 * - true → 用户手选，selectedVoice 原样作为来源，界面语言切换不覆盖它；
 * - false → 按当前界面语言派生默认音色，落实为 selectedVoice（同时同步
 *   搜索框显示），使跳转等下游逻辑直接复用、不必重复派生。
 *
 * 取代了原「按正文自动检测语言」的 resolveVoiceForText：默认音色不再读取
 * 正文，完全由界面语言决定（docs/adr/0002）。正文不参与音色选择，开始播放
 * 与界面语言切换走同一个派生入口，语义一致。
 *
 * 放在 voices/ 而非 player/：它是「选音色」这一音色域职责，且被 loader 与
 * language-select 复用；若放 player/ 会让 voices 反向依赖 player。
 * 依赖方向保持 player → voices。
 */
import type { PresetVoice } from '../../shared/types';
import { state } from '../state';
import { pickDefaultVoice } from '../../shared/voice-default';
import { updateClearButton } from '../ui';
import { formatVoiceName } from './format';
import { createContentLogger } from '../log';

const logger = createContentLogger('voices');

/**
 * 确保当前已有可用音色（selectedVoice 单一来源的守卫）：
 * - 用户已显式选择 → 沿用手选音色；
 * - 未显式选择 → 按当前界面语言派生默认音色，落实为 selectedVoice 并同步搜索框。
 *
 * 音色目录尚未加载（为空）时派生不出默认音色，保留当前 selectedVoice。
 * 调用方：音色加载完成、界面语言切换、开始播放（最终守卫）。
 */
export function ensureVoiceSelected(): PresetVoice | null {
  if (state.voiceSelectionIsManual && state.selectedVoice) {
    return state.selectedVoice;
  }

  const def = pickDefaultVoice(state.allVoices, state.interfaceLanguage);
  if (!def) return state.selectedVoice;

  logger.debug(`Default voice for interface language '${state.interfaceLanguage}': ${def.name}`);

  // 落实为单一来源：下游（点击跳转、下拉选中态、语言过滤）一律读 selectedVoice
  state.selectedVoice = def;
  state.voiceSelectionIsManual = false;
  if (state.voiceSearchInput) {
    state.voiceSearchInput.value = formatVoiceName(def);
    updateClearButton();
  }
  return def;
}
