/**
 * chrome.storage.local 变更同步：主页（popup）改了界面语言或主题时，
 * 已打开的悬浮窗即时跟随，无需重开页面。
 *
 * 悬浮窗不再单独提供语言 / 主题切换（统一在主页标题栏），此处是
 * 「主页改 → 悬浮窗变」的唯一通道。模块级注册一次，与 background 消息监听同级。
 */
import { state } from './state';
import { logger } from './log';
import { changeInterfaceLanguage } from './i18n';
import { filterVoices } from './voices';
import { ensureVoiceSelected } from './voices/voice-selection';
import { applyWidgetTheme } from './widget-init/theme';
import { INTERFACE_THEME_STORAGE } from '../shared/constants';

/** 主页切换语言后：重载 i18n 并应用到悬浮窗，未手选音色时按新语言重派生默认音色 */
async function onInterfaceLanguageChanged(locale: string): Promise<void> {
  try {
    await changeInterfaceLanguage(locale);
    // 未手选音色时，默认音色跟随界面语言重新派生（落实单一来源并同步搜索框 / 下拉选中态）
    if (!state.voiceSelectionIsManual) {
      ensureVoiceSelected();
      filterVoices('');
    }
    logger.debug('Interface language synced from popup:', locale);
  } catch (error) {
    logger.error('Error syncing interface language:', error);
  }
}

/** 注册存储变更监听（content script 加载时调用一次） */
export function registerStorageSync(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    const langChange = changes.interfaceLanguage;
    if (langChange && langChange.newValue) {
      void onInterfaceLanguageChanged(langChange.newValue);
    }

    const themeChange = changes[INTERFACE_THEME_STORAGE];
    if (themeChange) {
      applyWidgetTheme(themeChange.newValue === 'dark');
    }
  });
}
