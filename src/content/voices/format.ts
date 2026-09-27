/**
 * 音色显示格式化（纯函数：音色元数据 → 界面展示文本）。
 *
 * 从 voices.ts 拆出：把「音色叫什么」这件与加载 /
 * 下拉 UI 无关的纯转换单独成模块，loader 与 dropdown 都复用它，避免格式化逻辑
 * 在两处重复漂移。
 */
import { getFlagIdForLocale, getTranslatedCountry, getTranslatedLanguageName } from '../i18n';
import { languageNames } from '../../shared/language-names';
import type { PresetVoice } from '../../shared/types';

function formatVoiceDetails(voice: PresetVoice) {
  const locale = voice.language || '';
  let languageName = locale;
  for (const [code, name] of Object.entries(languageNames)) {
    if (locale.startsWith(code)) {
      languageName = name;
      break;
    }
  }
  const parts = locale.split('-');
  const countryCode = parts.length > 1 ? parts[1].toUpperCase() : null;
  const countryName = countryCode ? getTranslatedCountry(countryCode) : null;
  const flagId = getFlagIdForLocale(locale);
  return { languageName, countryName, flagId };
}

export function formatVoiceName(voice: PresetVoice) {
  let language = voice.language || '';
  let voiceName = voice.name || '';

  // Get full language name (English base) then translate for interface locale
  let fullLanguageName = language;
  for (const [code, name] of Object.entries(languageNames)) {
    if (language.startsWith(code)) {
      fullLanguageName = getTranslatedLanguageName(name);
      break;
    }
  }

  // Extract voice name without language code, Neural, and Multilingual
  let displayName = voiceName;
  // Remove language code prefix (e.g., "en-US-")
  if (language) {
    displayName = displayName.replace(new RegExp(`^${language}-`, 'i'), '');
  }
  // Remove Neural suffix
  displayName = displayName.replace(/Neural$/i, '');
  // Remove Multilingual (wherever it appears)
  displayName = displayName.replace(/Multilingual/gi, '');
  // Remove Expressive
  displayName = displayName.replace(/Expressive/gi, '');
  // Remove any remaining hyphens at the end and clean up double hyphens
  displayName = displayName.replace(/-+$/, '').replace(/^-+/, '').replace(/-+/g, '-');

  // Add country in parentheses if available
  let result = `${fullLanguageName} - ${displayName}`;
  const { countryName } = formatVoiceDetails(voice);
  if (countryName) {
    result += ` (${countryName})`;
  }

  return result;
}
