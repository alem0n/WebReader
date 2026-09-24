/**
 * 粘贴并朗读，以及 Google Docs 的引导提示。
 *
 * Google Docs 的正文被遮挡，本地采集拿不到内容：统一弹警告引导用户改用粘贴，
 * 避免各调用方（FAB / popup 阅读整页 / 悬浮窗）各自重复判断。
 */
import { state } from '../state';
import { i18n } from '../i18n';
import { showError, escapeHtml } from '../ui';
import { removeHTMLTags, removeSquareBrackets } from '../text-input';
import { createContentLogger } from '../log';
import { handleStop } from './stop-clear';

const logger = createContentLogger('player');

export async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      let cleanedText = removeHTMLTags(text);
      cleanedText = removeSquareBrackets(cleanedText);
      if (!cleanedText || !cleanedText.trim()) {
        showError(i18n('no_readable_text_found'));
        return;
      }
      if (state.sentencePlayer && state.sentencePlayer.isPlaying) {
        handleStop();
      }
      state.textContent!.textContent = '';
      state.textContent!.textContent = cleanedText.trim();
      // 粘贴内容与整页映射无关：作废规范路径，回退到 setText 切分
      state.pageTextUnits = null;
      state.pageTextMap = null;
      if (window.edgeTTSEnableAutoDetectIfNoVoice) {
        window.edgeTTSEnableAutoDetectIfNoVoice();
      }
      setTimeout(() => {
        if (state.playPauseBtn && !state.playPauseBtn.disabled) {
          logger.debug('Starting automatic playback...');
          state.playPauseBtn.click();
        } else {
          logger.debug('Play button disabled, cannot autoplay');
        }
      }, 300);
    } else {
      showError(i18n('clipboard_empty'));
    }
  } catch (error) {
    logger.error('Error reading clipboard:', error);
    showError(i18n('failed_to_read_clipboard'));
  }
}

export function showGoogleDocsWarning() {
  const errorText = state.errorMessage!.querySelector('.error-text') as any;
  if (errorText) {
    const raw = i18n('google_docs_instructions');
    const formatted = raw
      .split('\n')
      .map((line: string) => escapeHtml(line))
      .join('<br/>');

    errorText.innerHTML = `
        <div>${formatted}</div>
        <div class="warning-button-preview">
          <button class="btn btn-secondary btn-square btn-preview" type="button" title="${i18n('paste_from_clipboard')}">
            <svg class="btn-icon" width="22" height="22" aria-hidden="true">
              <use href="#icon-two-pages-play"></use>
            </svg>
          </button>
        </div>
      `;

    const previewBtn = errorText.querySelector('.warning-button-preview .btn-preview') as any;
    if (previewBtn) {
      previewBtn.addEventListener('click', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        handlePaste();
      });
    }
  } else {
    state.errorMessage!.textContent = i18n('google_docs_instructions');
  }
  state.errorMessage!.classList.add('warning');
  state.errorMessage!.classList.remove('hidden');
}
