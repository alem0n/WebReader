/**
 * 界面语言选择：下拉 change 与顶部语言条（滑出式旗帜条）。
 *
 * 语言切换走 i18n 模块；语言条是同一组语言的快捷入口，点击等价于把下拉
 * 值改到该 locale 并派发 change。
 */
import { state } from '../state';
import { logger } from '../log';
import { filterVoices } from '../voices';
import { ensureVoiceSelected } from '../voices/voice-selection';
import { updateLanguageSelectTooltip, updateLanguageButtonIcon, changeInterfaceLanguage } from '../i18n';

/** 用当前界面语言回填下拉值与按钮图标（在 DOM 引用填充之后调用） */
export function syncLanguageSelect(): void {
  if (state.languageSelect) {
    state.languageSelect.value = state.interfaceLanguage;
    updateLanguageSelectTooltip(state.interfaceLanguage);
    updateLanguageButtonIcon(state.interfaceLanguage);
  }
}

/** 下拉 change 监听：切换界面语言并更新提示 */
export function bindLanguageSelect(): void {
  if (state.languageSelect) {
    // Update tooltip on initialization
    updateLanguageSelectTooltip(state.interfaceLanguage);

    state.languageSelect.addEventListener('change', async (e) => {
      const selectedLocale = (e.target as any).value;
      logger.debug('Language selector changed to:', selectedLocale);
      try {
        await changeInterfaceLanguage(selectedLocale);
        updateLanguageSelectTooltip(selectedLocale);
        // 未手选音色时，默认音色跟随界面语言重新派生（落实单一来源并同步搜索框 / 下拉选中态）
        if (!state.voiceSelectionIsManual) {
          ensureVoiceSelected();
          filterVoices('');
        }
        logger.debug('Language change completed successfully');
      } catch (error) {
        logger.error('Error changing language:', error);
      }
    });
    logger.debug('Language selector event listener attached');
  } else {
    logger.warn('Language selector not found!');
  }
}

/** 顶部语言条：点击旗帜等价于把下拉值改到该 locale */
export function bindLanguageStrip(): void {
  if (state.languageButton && state.languageStrip && state.languageSelect && !(state.languageButton as any)._languageStripInitialized) {
    (state.languageButton as any)._languageStripInitialized = true;
    const flags = state.languageStrip.querySelectorAll('.language-strip-flag');

    const openStrip = () => {
      state.languageStrip!.classList.add('open');
      state.languageButton!.setAttribute('aria-expanded', 'true');
    };

    const closeStrip = () => {
      state.languageStrip!.classList.remove('open');
      state.languageButton!.setAttribute('aria-expanded', 'false');
    };

    state.languageButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.languageStrip!.classList.contains('open')) {
        closeStrip();
      } else {
        openStrip();
      }
    });

    state.languageButton.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    flags.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const locale = btn.getAttribute('data-locale');
        if (!locale) return;
        state.languageSelect!.value = locale;
        updateLanguageButtonIcon(locale);
        const event = new Event('change', { bubbles: true });
        state.languageSelect!.dispatchEvent(event);
        closeStrip();
      });
    });

    document.addEventListener('click', (e) => {
      if (!state.languageStrip!.contains(e.target as any) && !state.languageButton!.contains(e.target as any)) {
        closeStrip();
      }
    });
  }
}
