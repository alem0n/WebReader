/**
 * 整页朗读的主流程，以及句子映射（pageTextUnits / pageTextMap）的生命周期。
 *
 * 采集与播放之间存在时间差，期间页面 DOM 可能被改动（SPA 重渲染最常见）：
 * refreshMapIfStale 只用廉价的 isConnected 检测「元素已被替换 / 移除」，
 * 命中时用当前 DOM 重新采集重建；仅当镜像文本与建表时完全一致（正文内容未变，
 * 仅位置 / 结构漂移）才替换，保证「第 i 句」仍与页面元素逐句对齐。
 * 元素仍在文档中、仅文本节点漂移的情形由 reading-overlay 逐单元重建区间兜底。
 */
import { state } from '../state';
import { i18n } from '../i18n';
import { showError, updateTextHighlight, highlightFirstSentenceIfNeeded } from '../ui';
import { createWidget, getWidget, getWidgetElementById } from '../widget';
import { extractPageText, type TextUnit } from '../extractor';
import { collectPageForReading, getDisplayTextFromMap, type SentenceMap } from '../sentence-map';
import { prepareReadingOverlay, highlightSentence, clearReadingOverlay } from '../reading-overlay';
import { createContentLogger } from '../log';
import { scrollToCurrentChunk } from './scroll';
import { handleStop } from './stop-clear';
import { showGoogleDocsWarning } from './paste';

const logger = createContentLogger('player');

/**
 * 采集当前页面的正文文本。
 *
 * 使用移植自 kiss-translator 的块级遍历识别算法（见 extractor/）：自顶向下把 DOM
 * 拆成最小块级文本单元，忽略导航/页脚/脚本/本扩展自身 DOM，过滤 URL/数字等噪声，
 * 并按站点规则适配复杂页面。返回纯文本，段落以 \n\n 分隔，直接交给
 * SentencePlayer.setText 逐句朗读。
 *
 * 方括号内容（如引用标记 [1]）不再在此强制移除，统一交给可开关的「删除括号内容」
 * 过滤（applyParentheticalFilter）在播放前处理，行为与设置一致。
 */
export function collectPageText() {
  return extractPageText();
}

/**
 * 一键朗读整页：识别正文 → 显示播放器 → 自动播放。
 *
 * 页面内「朗读整页」悬浮按钮的直接入口，无需先打开插件主界面：
 * 本地采集正文（不向任何服务器上传页面内容）→ 构建句子→DOM 映射 →
 * 确保悬浮窗存在并可见 → 等待初始化 → 填入文本 → 自动开始播放。
 * 朗读进度、暂停/停止、逐句导航全部复用悬浮窗，同时可把当前句子显示在网页上。
 */
export async function playEntirePage(): Promise<void> {
  // Google Docs 正文被遮挡，本地采集拿不到内容：统一弹警告引导用户改用粘贴，
  // 避免各调用方（FAB / popup 阅读整页 / 悬浮窗）各自重复判断
  if (
    typeof window.location !== 'undefined' &&
    typeof window.location.hostname === 'string' &&
    window.location.hostname.includes('docs.google.com')
  ) {
    await ensureWidgetVisible();
    showGoogleDocsWarning();
    return;
  }

  // 采集正文段落单元并构建规范句子表（与播放器同一切分管线，不二次切分）
  const { units, map } = collectPageForReading();

  // 无论有没有正文都弹出悬浮窗：无正文时走统一的错误提示，便于用户排查
  await ensureWidgetVisible();

  if (!map.sentences.length) {
    showError(i18n('no_text_found'));
    return;
  }

  // 先停止正在进行的播放（选中文字朗读 / 上一次整页朗读），
  // 否则 handlePlayPause 会命中「暂停」分支，新文本被填入却不播放。
  if (state.sentencePlayer?.isPlaying) {
    handleStop();
  }

  // 悬浮窗若停在 API Key 界面（尚未配置），先暂存正文：
  // 此时 playerContainer 被隐藏，填文本与自动播放都会落空，
  // 待用户配好 Key（apiKeySaved 广播到达）后自动消费（重新采集并朗读）。
  if (state.apiKeyContainer && state.apiKeyContainer.style.display !== 'none') {
    state.pendingPageText = getDisplayTextFromMap(map);
    logger.info('未配置 API Key，已暂存整页正文，配好后自动朗读');
    return;
  }

  state.pendingPageText = null;
  setPageTextAndAutoPlay(units, map);
}

/** 确保悬浮窗已创建并可见（与 playSelectedText 一致的处理方式） */
async function ensureWidgetVisible(): Promise<void> {
  let widget = getWidget();
  if (!widget) {
    createWidget();
    widget = getWidget();
  }
  if (widget) {
    widget.style.display = 'block';
  }
}

/**
 * 填入文本并自动播放（带重试，等待悬浮窗初始化完成）。
 *
 * 文本框填充为规范句子表的镜像文本，并把 units/map 存入 state，使 handlePlayPause
 * 的「规范路径」自检成立 —— 播放器直接复用预构建句子表，不二次切分，
 * 网页内跟读显示据此把每句话回指到正确的页面元素。
 */
function setPageTextAndAutoPlay(units: TextUnit[], map: SentenceMap, attempts = 0): void {
  state.textContent = getWidgetElementById('text-content') as any;
  state.playPauseBtn = getWidgetElementById('play-pause-btn') as any;

  if (state.textContent && state.playPauseBtn) {
    state.textContent.textContent = getDisplayTextFromMap(map);
    state.pageTextUnits = units;
    state.pageTextMap = map;

    setTimeout(() => {
      highlightFirstSentenceIfNeeded();
    }, 100);

    setTimeout(() => {
      const btn = getWidgetElementById('play-pause-btn') as any;
      if (btn && !btn.disabled) {
        btn.click();
      } else if (attempts < 10) {
        // 音色可能仍在加载，按钮还不可用，稍后重试
        setTimeout(() => setPageTextAndAutoPlay(units, map, attempts + 1), 300);
      }
    }, 500);
  } else if (attempts < 20) {
    // 悬浮窗尚未初始化完成，稍后重试
    setTimeout(() => setPageTextAndAutoPlay(units, map, attempts + 1), 100);
  }
}

function refreshMapIfStale(): void {
  const units = state.pageTextUnits;
  const map = state.pageTextMap;
  if (!units || !map || !map.sentences.length) return;

  const detached = units.some((u) => !u.element.isConnected);
  if (!detached) return;

  const { units: newUnits, map: newMap } = collectPageForReading();
  if (!newMap.sentences.length) return;
  // 正文内容未变才接受新映射；否则保留旧映射，交给覆盖层逐单元兜底重建
  if (getDisplayTextFromMap(newMap) !== getDisplayTextFromMap(map)) {
    logger.debug('页面正文内容已变化，保留旧映射，由覆盖层逐单元兜底重建');
    return;
  }

  state.pageTextUnits = newUnits;
  state.pageTextMap = newMap;
  if (state.textContent) {
    state.textContent.textContent = getDisplayTextFromMap(newMap);
  }
  logger.debug('页面 DOM 已变化，已用最新 DOM 重建句子映射');
}

/**
 * 网页内高亮当前朗读句子（主开关关闭或无句子映射时静默跳过）。
 *
 * 映射不存在（选中朗读 / 粘贴等非整页场景）时不激活网页内高亮，
 * 这些场景没有 DOM 回指，文本框仍是唯一展示。
 */
function showInlineForSentence(sentenceIndex: number): void {
  if (!state.inlineDisplayEnabled) return;
  if (!state.pageTextMap) return;
  highlightSentence(sentenceIndex);
}

/**
 * 句子切换的统一回调：悬浮窗高亮 + 文本框滚动 + 网页内逐句高亮。
 *
 * 播放、上一句、下一句三处调用点统一收敛到这里，保证网页高亮与音频同步。
 */
export function onSentenceChanged(sentenceIndex: number): void {
  updateTextHighlight(sentenceIndex);
  scrollToCurrentChunk(sentenceIndex);
  showInlineForSentence(sentenceIndex);
}

/**
 * 按当前开关与句子映射刷新网页内高亮覆盖层（供设置开关运行中切换调用）。
 *
 * 开启：重新包裹句子 span 并高亮当前句；关闭：拆除覆盖层、还原页面。
 * 未在播放或无句子映射时，仅保证页面无残留。
 */
export function refreshInlineReading(): void {
  if (!state.inlineDisplayEnabled) {
    clearReadingOverlay();
    return;
  }
  const map = state.pageTextMap;
  const units = state.pageTextUnits;
  if (!map || !units || !state.sentencePlayer) {
    clearReadingOverlay();
    return;
  }
  // 运行中切回开启时，页面可能已变化：先按最新 DOM 重建映射再包裹
  refreshMapIfStale();
  prepareReadingOverlay(state.pageTextUnits ?? units, state.pageTextMap ?? map);
  highlightSentence(state.sentencePlayer.currentIndex);
}

export { refreshMapIfStale };
