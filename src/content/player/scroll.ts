/**
 * 播放器文本框的句子滚动跟随。
 *
 * 网页内逐句高亮开启且存在句子映射时，页面级滚动由 reading-overlay 接管，
 * 此处不再滚动文本框；其余情况把当前句滚进文本框可视区（高亮句优先，取不到
 * 高亮句时按比例滚动兜底）。
 */
import { state } from '../state';
import { createContentLogger } from '../log';

const logger = createContentLogger('player');

export function scrollToCurrentChunk(sentenceIndex: number) {
  // 网页内逐句高亮开启且存在句子映射时，页面级滚动由 reading-overlay 接管，不再滚动文本框
  if (state.inlineDisplayEnabled && state.pageTextMap) {
    return;
  }
  if (!state.textContent || !state.sentencePlayer) return;

  const totalSentences = state.sentencePlayer.sentences.length;
  if (totalSentences === 0 || sentenceIndex < 0 || sentenceIndex >= totalSentences) return;

  const highlightedElement = state.textContent.querySelector('.highlight') as any;

  if (highlightedElement) {
    const elRect = highlightedElement.getBoundingClientRect();
    const containerRect = state.textContent.getBoundingClientRect();
    const containerHeight = state.textContent.clientHeight;
    const PADDING = 40; // px of breathing room above the highlighted sentence

    const isTopVisible = elRect.top >= containerRect.top;
    const isBottomVisible = elRect.bottom <= containerRect.bottom;

    if (!isTopVisible || !isBottomVisible) {
      // Convert element top to a scrollTop value
      const elOffsetTop = highlightedElement.offsetTop;

      let targetScrollTop;
      if (elRect.height + PADDING <= containerHeight) {
        // Sentence fits entirely — scroll so the whole sentence is visible with padding
        if (!isTopVisible) {
          // Sentence is above: bring top into view with padding
          targetScrollTop = elOffsetTop - PADDING;
        } else {
          // Sentence is below or partially below: align bottom with container bottom + padding
          targetScrollTop = elOffsetTop + elRect.height - containerHeight + PADDING;
        }
      } else {
        // Sentence is taller than the container — just show the beginning
        targetScrollTop = elOffsetTop - PADDING;
      }

      state.textContent.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });

      logger.debug(`Scrolling to sentence ${sentenceIndex}`);
    }
  } else {
    // Fallback: proportional scroll if no highlight found
    const scrollRatio = sentenceIndex / totalSentences;
    const maxScroll = state.textContent.scrollHeight - state.textContent.clientHeight;
    state.textContent.scrollTo({
      top: maxScroll * scrollRatio,
      behavior: 'smooth',
    });
    logger.debug(`Fallback scroll to sentence ${sentenceIndex}/${totalSentences}`);
  }
}
