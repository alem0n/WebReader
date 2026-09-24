/**
 * 悬浮窗内文本高亮：把当前朗读的句子在文本框里加高亮类，段落分隔语义与
 * SentencePlayer.getDisplaySeparatorAfter 一致。
 *
 * 网页原位的逐句高亮（不覆盖原文那种）在 reading-overlay.ts，本模块只管
 * 悬浮窗文本框内的展示。
 */
import { applyParentheticalFilter } from '../utils';
import { SentencePlayer } from '../../shared/sentence-player';
import { state } from '../state';
import { createContentLogger } from '../log';

const logger = createContentLogger('ui/text-highlight');

/**
 * 构建带高亮句与段落分隔的展示 HTML（段落分隔语义同 SentencePlayer.getDisplaySeparatorAfter）。
 *
 * 抽出公共函数供首句高亮与播放中高亮共用，保证两处渲染逐句一致。
 */
function buildHighlightHtml(sentences: string[], paragraphBreakAfterIndex: Set<number>, highlightIndex: number): string {
  let html = '';
  for (let i = 0; i < sentences.length; i++) {
    if (i === highlightIndex) {
      html += `<span class="highlight">${escapeHtml(sentences[i])}</span>`;
    } else {
      html += escapeHtml(sentences[i]);
    }
    if (i < sentences.length - 1) {
      html += paragraphBreakAfterIndex.has(i) ? '\n\n' : ' ';
    }
  }
  return html;
}

export function escapeHtml(text: string) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function highlightFirstSentenceIfNeeded() {
  if (!state.textContent) return;

  // 整页规范路径：直接用规范句子表高亮首句，与实际播放逐句一致（不二次切分）
  const map = state.pageTextMap;
  if (map && map.sentences.length > 0) {
    state.textContent.innerHTML = buildHighlightHtml(map.sentences, map.paragraphBreakAfterIndex, 0);
    logger.debug('First sentence highlighted (canonical map)');
    return;
  }

  // 旧路径：从文本框现切（选中朗读 / 粘贴 等无 DOM 映射场景）
  const text = applyParentheticalFilter((state.textContent.textContent || state.textContent.innerText || '').trim());

  // Only highlight if there's text and no playback is active
  if (text && state.sentencePlayer && (!state.sentencePlayer.isPlaying || state.sentencePlayer.isPaused)) {
    // Split text into sentences (paragraph breaks preserved in tempPlayer)
    const tempPlayer = new SentencePlayer();
    tempPlayer.setText(text);

    if (tempPlayer.sentences.length > 0) {
      state.textContent.innerHTML = buildHighlightHtml(tempPlayer.sentences, tempPlayer.paragraphBreakAfterIndex, 0);
      logger.debug('First sentence highlighted');
    }
  }
}

export function updateTextHighlight(sentenceIndex: number) {
  if (!state.sentencePlayer || !state.textContent) return;

  const sentences = state.sentencePlayer.sentences;
  if (sentences.length === 0) return;

  state.textContent.innerHTML = buildHighlightHtml(sentences, state.sentencePlayer.paragraphBreakAfterIndex, sentenceIndex);

  // Note: Auto-scroll is now only done when a new chunk starts (in playSentenceChunk)
  // This allows users to manually scroll without interruption during playback
}
