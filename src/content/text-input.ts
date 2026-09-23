/** text-input (migrated from content.js) */
import { state } from './state';
import { createWidget, getWidget, getWidgetElementById } from './widget';
import { highlightFirstSentenceIfNeeded } from './ui';
import { createContentLogger } from './log';

const logger = createContentLogger('text-input');
export function removeHTMLTags(text: string) {
  if (!text) return text;
  // Create a temporary DOM element to safely strip HTML tags
  const temp = document.createElement('div');
  temp.innerHTML = text;
  // Get text content (automatically removes all HTML tags)
  return temp.textContent || temp.innerText || '';
}

export function removeSquareBrackets(text: string) {
  if (!text) return text;
  // Remove everything between square brackets including the brackets
  // This regex matches [anything] including nested brackets and newlines
  return text.replace(/\[[^\]]*\]/g, '').trim();
}

export function addTextToTextareaAndPlay(text: string) {
  // Remove HTML tags first, then remove content in square brackets
  text = removeHTMLTags(text);
  text = removeSquareBrackets(text);

  // Ensure widget exists and is visible
  let widget = getWidget();
  const widgetJustCreated = !widget;

  if (!widget) {
    createWidget();
    widget = getWidget();
  }

  // Show widget
  if (widget) {
    widget.style.display = 'block';
  }

  // Stop any current playback before adding new text
  const stopCurrentPlayback = () => {
    if (widget && window.edgeTTSStopPlayback) {
      window.edgeTTSStopPlayback();
    }
  };

  if (!widgetJustCreated) {
    stopCurrentPlayback();
  }

  // Wait for widget to initialize, then add text and play
  const tryAddTextAndPlay = (attempts = 0) => {
    state.textContent = getWidgetElementById('text-content') as any;
    state.playPauseBtn = getWidgetElementById('play-pause-btn') as any;
    const voiceLoading = getWidgetElementById('voice-loading') as any;

    // Check if voices are still loading
    const voicesAreLoading = voiceLoading && !voiceLoading.classList.contains('hidden');

    // If voices are still loading and we haven't tried too many times, wait
    if (voicesAreLoading && attempts < 30) {
      logger.debug('Waiting for voices to load... attempt', attempts);
      setTimeout(() => tryAddTextAndPlay(attempts + 1), 200);
      return;
    }

    // Check if all necessary elements are present and initialized
    if (state.textContent && state.playPauseBtn && state.toggleCheckboxes.autoDetectLanguage) {
      logger.debug('Adding text and playing, auto-detect was:', state.autoDetectLanguage);

      // Replace text in content div (overwrite existing text)
      state.textContent.textContent = text;

      logger.debug('Text set:', text.substring(0, 50) + '...');
      logger.debug('textContent.textContent:', state.textContent.textContent.substring(0, 50));
      logger.debug('textContent visible:', state.textContent.offsetHeight, 'px');

      // Enable auto-detect only if no voice is selected
      if (window.edgeTTSEnableAutoDetectIfNoVoice) {
        window.edgeTTSEnableAutoDetectIfNoVoice();
      }

      // Give a moment for the content to update, then start playback immediately
      setTimeout(() => {
        logger.debug('Starting playback...');

        // Trigger play button click to start playback immediately
        const playPauseBtnAfter = getWidgetElementById('play-pause-btn') as any;
        if (playPauseBtnAfter && !playPauseBtnAfter.disabled) {
          playPauseBtnAfter.click();
        } else {
          // Retry if button is still disabled (voices might still be loading)
          if (attempts < 40) {
            setTimeout(() => tryAddTextAndPlay(attempts + 1), 300);
          } else {
            logger.debug('Play button is disabled after multiple attempts');
          }
        }
      }, 400);

      // Scroll to bottom
      state.textContent.scrollTop = state.textContent.scrollHeight;
    } else if (attempts < 40) {
      // Retry if elements not found yet - give more time if widget was just created
      const delay = widgetJustCreated && attempts < 5 ? 200 : 100;
      setTimeout(() => tryAddTextAndPlay(attempts + 1), delay);
    }
  };

  // If widget was just created, give it more time to initialize
  setTimeout(() => tryAddTextAndPlay(), widgetJustCreated ? 500 : 100);
}

export function playSelectedText(text: string) {
  // Remove HTML tags first, then remove content in square brackets
  text = removeHTMLTags(text);
  text = removeSquareBrackets(text);

  // Ensure widget exists and is visible
  let widget = getWidget();
  if (!widget) {
    createWidget();
    widget = getWidget();
  }

  // Show widget
  if (widget) {
    widget.style.display = 'block';
  }

  // Wait for widget to initialize, then set text and play
  const trySetAndPlay = (attempts = 0) => {
    state.textContent = getWidgetElementById('text-content') as any;
    state.playPauseBtn = getWidgetElementById('play-pause-btn') as any;

    if (state.textContent && state.playPauseBtn) {
      // Set text
      state.textContent.textContent = text;

      logger.debug('Text set:', text.substring(0, 50) + '...');

      // Highlight first sentence immediately (if highlightFirstSentenceIfNeeded is defined in the widget scope)
      setTimeout(() => {
        if (typeof highlightFirstSentenceIfNeeded === 'function') {
          highlightFirstSentenceIfNeeded();
        }
      }, 100);

      // Wait a bit for voices to load and button to become enabled, then trigger play
      setTimeout(() => {
        const playPauseBtnAfter = getWidgetElementById('play-pause-btn') as any;
        if (playPauseBtnAfter && !playPauseBtnAfter.disabled) {
          playPauseBtnAfter.click();
        } else if (attempts < 10) {
          // Retry if button is still disabled (voices might still be loading)
          setTimeout(() => trySetAndPlay(attempts + 1), 300);
        }
      }, 500);
    } else if (attempts < 20) {
      // Retry if elements not found yet
      setTimeout(() => trySetAndPlay(attempts + 1), 100);
    }
  };

  trySetAndPlay();
}
