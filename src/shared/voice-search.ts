/**
 * 音色搜索文本构建（引擎无关的纯领域逻辑）。
 *
 * 设计原则（AGENTS.md §0.2 领域模型）：输入统一是 PresetVoice 契约
 * （name / voice / language / gender），本模块不感知也不引用任何具体语音引擎
 * ——MiMo 本地预置目录与 relay（Edge）后端目录都发射同形状的 PresetVoice[]，
 * 因此搜索行为对两个引擎完全一致；将来新增引擎只要也产出 PresetVoice[]，
 * 搜索零改动。这是「接口化而非深度绑定引擎」的落点：调用方只面向
 * buildVoiceSearchText / matchVoiceSearchTerm 两个稳定函数。
 *
 * 覆盖范围（把用户可能输入的自然词都映射到可匹配文本）：
 *  - 原始字段：音色名、voice id、语言代码（性别单独精确匹配，见下）
 *  - 语言代码拆段：zh-CN → zh / CN，方便只输 zh / en
 *  - 语言名：英文基准（Chinese / English）+ 中文（中文 / 英语）+ 通称别名（英文）
 *  - 国家名：zh-CN → China / 中国（取语言代码的 region 段）
 *  - 性别：Female / Male + 中文（女 / 男），按词精确匹配——
 *    Male 是 Female 的子串，若也走子串匹配，搜 Male 会把女声一起带出来
 *
 * 界面语言只有中 / 英两档，两档名称一律都纳入：用户无论当前是中文还是英文界面，
 * 用中文或英文搜索都能命中对应音色（双向兼容，不随界面语言切换而变化）。
 *
 * 纯函数：不持有任何层状态，不依赖 DOM，popup 与 content 共用同一份实现，
 * 避免两层各写一套过滤而漂移（原则 7：复用稳定的业务语义）。
 */
import type { PresetVoice } from './types';
import { languageNames } from './language-names/language-names-en';
import { countryNamesEn } from './language-names/country-names-en';
import { languageNameZh, countryNamesZh } from './language-names/zh';
import { genderTranslations } from './language-names/gender-translations';
/**
 * 语言通称别名（按英文语言名索引）：翻译表里 English → 「英语」，
 * 但中文用户常搜「英文」这个通称，补一条别名让常用词也命中。
 * 新增别名只需在此追加，仍与具体引擎无关。
 */
const LANGUAGE_NAME_ALIASES: Record<string, string[]> = {
  English: ['英文'],
};

/** 中文语言名表显式索引类型：键是动态英文语言名，字面量对象无索引签名 */
const ZH_LANGUAGE_NAMES: Record<string, string> = languageNameZh;
/** 中文国家名表显式索引类型：键是动态国家代码 */
const ZH_COUNTRY_NAMES: Record<string, string> = countryNamesZh;
/** 中文性别表：只取 zh_CN 一档（界面语言仅中 / 英两档） */
const ZH_GENDER_NAMES: Record<string, string> = genderTranslations.zh_CN;
/** 语言代码 → 英文语言名（如 zh-CN → Chinese），取首个前缀匹配项 */
function resolveLanguageEnglishName(locale: string): string {
  if (!locale) return '';
  for (const [code, name] of Object.entries(languageNames)) {
    if (locale.startsWith(code)) return name;
  }
  return '';
}

/** 语言代码 → 国家代码（如 zh-CN → CN），无 region 段返回空串 */
function resolveRegionCode(locale: string): string {
  const parts = locale.split('-');
  return parts.length > 1 ? parts[1].toUpperCase() : '';
}

/**
 * 把单个音色构建成可搜索文本（小写）。
 *
 * @param voice 引擎无关的音色条目
 * @returns 全部可匹配词以空格拼接并小写后的文本
 */
export function buildVoiceSearchText(voice: PresetVoice): string {
  // 注意不含 gender：Male 是 Female 的子串，放子串文本里搜 Male 会带出女声，
  // 性别改由 matchVoiceSearchTerm 走精确匹配（matchGender）
  const parts: string[] = [voice.name || '', voice.voice || '', voice.language || ''];

  if (voice.language) {
    // 语言代码拆段（zh-CN → zh / CN），方便只输 zh / en
    parts.push(...voice.language.split('-'));

    const englishName = resolveLanguageEnglishName(voice.language);
    if (englishName) {
      parts.push(englishName); // Chinese / English
      const zhName = ZH_LANGUAGE_NAMES[englishName];
      if (zhName) parts.push(zhName); // 中文 / 英语
      for (const alias of LANGUAGE_NAME_ALIASES[englishName] || []) parts.push(alias); // 英文
    }

    // 国家名（语言代码带 region 时）：zh-CN → China / 中国
    const region = resolveRegionCode(voice.language);
    if (region) {
      const countryEn = countryNamesEn[region];
      if (countryEn) parts.push(countryEn);
      const countryZh = ZH_COUNTRY_NAMES[region];
      if (countryZh) parts.push(countryZh);
    }
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * 性别精确匹配：Female / Male + 中文（女 / 男）。
 *
 * 单列出来不走子串匹配——Male 是 Female 的子串，混在一起搜 Male 会把女声
 * 一起带出来。性别是封闭枚举，按词相等匹配才准确；中文「女 / 男」同理。
 */
function matchGender(voice: PresetVoice, term: string): boolean {
  if (!voice.gender) return false;
  if (voice.gender.toLowerCase() === term) return true;
  const genderZh = ZH_GENDER_NAMES[voice.gender];
  return !!genderZh && genderZh === term;
}

/**
 * 判断音色是否匹配搜索词（大小写不敏感）。
 *
 * @param voice 引擎无关的音色条目
 * @param term 用户输入的搜索词（内部自行 trim + 小写）
 */
export function matchVoiceSearchTerm(voice: PresetVoice, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return true; // 空搜索词由调用方自行决定展示全部
  return buildVoiceSearchText(voice).includes(normalized) || matchGender(voice, normalized);
}
