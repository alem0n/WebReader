/**
 * 长文本语言检测：字符脚本比例 + 停用词频 + 特有字符的加权评分。
 *
 * 各语言停用词表（特征常量）拆到同目录 word-lists-*.ts；评分顺序与加权系数
 * 保持与原实现一致——保加利亚 / 乌克兰在西里尔分支内优先于俄语，俄语仅在
 * 两者均未命中时计分。返回「语言码 -> 分数」映射，取最高分的逻辑由调用方
 * （index.ts）按平局规则择优。
 */
import { bgWords, ukWords, ruWords } from './word-lists-cyrillic';
import { deWords, frWords, esWords, ptWords, itWords, nlWords, enWords } from './word-lists-western';
import { svWords, daWords, fiWords, noWords } from './word-lists-nordic';
import { plWords, elWords, csWords, huWords, roWords, trWords, viWords } from './word-lists-central-eastern';

/** 统计文本中命中停用词表的数量（按单词边界匹配，文本已转小写） */
function countWordHits(words: string[], lowerText: string): number {
  return words.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
}

export function scoreLanguages(text: string): Record<string, number> {
  const lowerText = text.toLowerCase();
  const languageScores: Record<string, number> = {};

  // Character set detection (weighted by ratio)
  const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const cyrillicRatio = cyrillicChars / text.length;
  const cjkChars = (text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []).length;
  const cjkRatio = cjkChars / text.length;
  const hiraganaKatakanaChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  const hiraganaKatakanaRatio = hiraganaKatakanaChars / text.length;
  const hangulChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const hangulRatio = hangulChars / text.length;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const arabicRatio = arabicChars / text.length;

  // Bulgarian (Cyrillic) - check before Russian to prioritize
  if (cyrillicRatio > 0.1) {
    const bgWordCount = countWordHits(bgWords, lowerText);
    if (bgWordCount > 0) {
      languageScores['bg-BG'] = cyrillicRatio * 100 + bgWordCount * 8; // Higher weight for Bulgarian words
    }
  }

  // Ukrainian (Cyrillic) - check before Russian to prioritize
  if (cyrillicRatio > 0.1) {
    const ukWordCount = countWordHits(ukWords, lowerText);
    const hasUkrainianChars = /[іїєІЇЄ]/.test(text);
    if (ukWordCount > 0 || hasUkrainianChars) {
      languageScores['uk-UA'] = cyrillicRatio * 100 + ukWordCount * 8 + (hasUkrainianChars ? 30 : 0); // Higher weight for Ukrainian
    }
  }

  // Russian (Cyrillic) - only if Bulgarian and Ukrainian are not detected
  if (cyrillicRatio > 0.1 && !languageScores['bg-BG'] && !languageScores['uk-UA']) {
    const ruWordCount = countWordHits(ruWords, lowerText);
    languageScores['ru-RU'] = cyrillicRatio * 100 + ruWordCount * 5;
  }

  // Chinese (CJK)
  if (cjkRatio > 0.1) {
    languageScores['zh-CN'] = cjkRatio * 100;
  }

  // Japanese
  if (hiraganaKatakanaRatio > 0.05) {
    languageScores['ja-JP'] = hiraganaKatakanaRatio * 100;
  }

  // Korean
  if (hangulRatio > 0.1) {
    languageScores['ko-KR'] = hangulRatio * 100;
  }

  // Arabic
  if (arabicRatio > 0.1) {
    languageScores['ar'] = arabicRatio * 100;
  }

  // European languages - count word matches
  // German
  const deWordCount = countWordHits(deWords, lowerText);
  const hasGermanChars = /[äöüßÄÖÜ]/.test(text);
  if (deWordCount > 0 || hasGermanChars) {
    languageScores['de-DE'] = deWordCount * 3 + (hasGermanChars ? 10 : 0);
  }

  // French
  const frWordCount = countWordHits(frWords, lowerText);
  const hasFrenchChars = /[âêîôûëïüÿç]/.test(text); // More specific French chars
  if (frWordCount > 0 || hasFrenchChars) {
    languageScores['fr-FR'] = frWordCount * 3 + (hasFrenchChars ? 15 : 0);
  }

  // Spanish
  const esWordCount = countWordHits(esWords, lowerText);
  const hasSpanishChars = /[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text);
  if (esWordCount > 0 || hasSpanishChars) {
    languageScores['es-ES'] = esWordCount * 3 + (hasSpanishChars ? 10 : 0);
  }

  // Portuguese
  const ptWordCount = countWordHits(ptWords, lowerText);
  const hasPortugueseChars = /[ãõçÃÕÇ]/.test(text);
  if (ptWordCount > 0 || hasPortugueseChars) {
    languageScores['pt-PT'] = ptWordCount * 3 + (hasPortugueseChars ? 10 : 0);
  }

  // Italian
  const itWordCount = countWordHits(itWords, lowerText);
  const hasItalianChars = /[àèéìòù]/.test(text); // Italian accents
  const hasItalianDoubleConsonants = /[bcdfglmnpqrstvz]{2}/.test(text.toLowerCase()); // Common in Italian
  if (itWordCount > 0 || hasItalianChars) {
    languageScores['it-IT'] = itWordCount * 4 + (hasItalianChars ? 15 : 0) + (hasItalianDoubleConsonants ? 5 : 0);
  }

  // Polish - only give full char bonus when density is sufficient or Polish words found
  const hasPolishUniqueChars = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(text);
  const plWordCount = countWordHits(plWords, lowerText);
  const hasPolishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text);
  const plCharCount = (text.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g) || []).length;
  const plCharRatio = plCharCount / text.length;
  if (plWordCount > 0 || plCharRatio > 0.01) {
    const uniqueCharBonus = hasPolishUniqueChars && (plWordCount >= 1 || plCharRatio > 0.015) ? 30 : 0;
    const charBonus = hasPolishChars && (plWordCount >= 1 || plCharRatio > 0.01) ? 15 : 0;
    languageScores['pl-PL'] = plWordCount * 4 + charBonus + uniqueCharBonus;
  }

  // Swedish
  const svWordCount = countWordHits(svWords, lowerText);
  const hasSwedishChars = /[åäöÅÄÖ]/.test(text);
  if (svWordCount > 0 || hasSwedishChars) {
    languageScores['sv-SE'] = svWordCount * 3 + (hasSwedishChars ? 15 : 0);
  }

  // Danish
  const daWordCount = countWordHits(daWords, lowerText);
  const hasDanishChars = /[åæøÅÆØ]/.test(text);
  if (daWordCount > 0 || hasDanishChars) {
    languageScores['da-DK'] = daWordCount * 3 + (hasDanishChars ? 15 : 0);
  }

  // Finnish
  const fiWordCount = countWordHits(fiWords, lowerText);
  const hasFinnishChars = /[äöÄÖ]/.test(text);
  if (fiWordCount > 0 || hasFinnishChars) {
    languageScores['fi-FI'] = fiWordCount * 3 + (hasFinnishChars ? 10 : 0);
  }

  // Norwegian
  const noWordCount = countWordHits(noWords, lowerText);
  const hasNorwegianChars = /[åæøÅÆØ]/.test(text);
  if (noWordCount > 0 || hasNorwegianChars) {
    languageScores['nb-NO'] = noWordCount * 3 + (hasNorwegianChars ? 15 : 0);
  }

  // Turkish
  const trWordCount = countWordHits(trWords, lowerText);
  const hasTurkishChars = /[çğıöşüÇĞİÖŞÜ]/.test(text); // 注意：不含拉丁大写 I，避免英文 "I" 误判
  if (trWordCount > 0 || hasTurkishChars) {
    languageScores['tr-TR'] = trWordCount * 3 + (hasTurkishChars ? 15 : 0);
  }

  // Dutch
  const nlWordCount = countWordHits(nlWords, lowerText);
  const hasDutchChars = /[ëïËÏ]/.test(text);
  if (nlWordCount > 0 || hasDutchChars) {
    languageScores['nl-NL'] = nlWordCount * 3 + (hasDutchChars ? 10 : 0);
  }

  // Greek
  const elChars = (text.match(/[\u0370-\u03FF]/g) || []).length;
  const elRatio = elChars / text.length;
  if (elRatio > 0.1) {
    const elWordCount = countWordHits(elWords, lowerText);
    languageScores['el-GR'] = elRatio * 100 + elWordCount * 3;
  }

  // Czech - only give full char bonus when density is sufficient or Czech words found
  const csWordCount = countWordHits(csWords, lowerText);
  const hasCzechUniqueChars = /[čďěňřťůČĎĚŇŘŤŮ]/.test(text);
  const hasCzechChars = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(text);
  const csCharCount = (text.match(/[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g) || []).length;
  const csCharRatio = csCharCount / text.length;
  if (csWordCount > 0 || csCharRatio > 0.01) {
    if (hasCzechUniqueChars || csWordCount >= 2) {
      const uniqueCharBonus = hasCzechUniqueChars && (csWordCount >= 1 || csCharRatio > 0.015) ? 25 : 0;
      const charBonus = hasCzechChars && (csWordCount >= 1 || csCharRatio > 0.01) ? 10 : 0;
      languageScores['cs-CZ'] = csWordCount * 3 + charBonus + uniqueCharBonus;
    }
  }

  // Hungarian
  const huWordCount = countWordHits(huWords, lowerText);
  const hasHungarianChars = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(text);
  if (huWordCount > 0 || hasHungarianChars) {
    languageScores['hu-HU'] = huWordCount * 3 + (hasHungarianChars ? 15 : 0);
  }

  // Romanian
  const roWordCount = countWordHits(roWords, lowerText);
  const hasRomanianChars = /[ăâîșțĂÂÎȘȚ]/.test(text);
  if (roWordCount > 0 || hasRomanianChars) {
    languageScores['ro-RO'] = roWordCount * 3 + (hasRomanianChars ? 15 : 0);
  }

  // Hindi (Devanagari script)
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const devanagariRatio = devanagariChars / text.length;
  if (devanagariRatio > 0.1) {
    languageScores['hi-IN'] = devanagariRatio * 100;
  }

  // Hebrew (Hebrew script)
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const hebrewRatio = hebrewChars / text.length;
  if (hebrewRatio > 0.1) {
    languageScores['he-IL'] = hebrewRatio * 100;
  }

  // Vietnamese
  const viWordCount = countWordHits(viWords, lowerText);
  const hasVietnameseChars =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(
      text
    );
  if (viWordCount > 0 || hasVietnameseChars) {
    languageScores['vi-VN'] = viWordCount * 3 + (hasVietnameseChars ? 20 : 0);
  }

  // English (default for Latin script)
  const enWordCount = countWordHits(enWords, lowerText);
  if (enWordCount > 0) {
    languageScores['en-US'] = enWordCount * 3;
  }

  return languageScores;
}
