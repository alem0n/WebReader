/** detect-language (migrated from content.js) */
import { createLogger } from './log';

const logger = createLogger('WebReader/detect-language');

export function detectLanguage(text: string) {
  if (!text) return null;
  // 短文本（<20字）跳过词频统计，仅按字符脚本判断，
  // 保证短中文/日文/韩文/西里尔/阿拉伯等不被回退为英文
  if (text.length < 20) {
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja-JP'; // 假名优先于汉字
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text)) return 'zh-CN';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
    if (/[\u0590-\u05FF]/.test(text)) return 'he-IL';
    return null; // 拉丁/未知短文本保持 null，由调用方按脚本回退
  }

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
    const bgWords = [
      'и',
      'в',
      'на',
      'с',
      'за',
      'от',
      'до',
      'по',
      'че',
      'като',
      'когато',
      'където',
      'как',
      'какъв',
      'кой',
      'коя',
      'кое',
      'кои',
      'но',
      'или',
      'защото',
      'ако',
      'кога',
      'къде',
      'какво',
      'който',
      'която',
      'което',
      'които',
    ];
    const bgWordCount = bgWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
    if (bgWordCount > 0) {
      languageScores['bg-BG'] = cyrillicRatio * 100 + bgWordCount * 8; // Higher weight for Bulgarian words
    }
  }

  // Ukrainian (Cyrillic) - check before Russian to prioritize
  if (cyrillicRatio > 0.1) {
    const ukWords = [
      'і',
      'в',
      'на',
      'з',
      'для',
      'від',
      'до',
      'по',
      'що',
      'як',
      'коли',
      'де',
      'який',
      'яка',
      'яке',
      'які',
      'але',
      'або',
      'бо',
      'якщо',
      'коли',
      'де',
      'що',
      'хто',
      'який',
      'яка',
      'яке',
      'які',
    ];
    const ukWordCount = ukWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
    const hasUkrainianChars = /[іїєІЇЄ]/.test(text);
    if (ukWordCount > 0 || hasUkrainianChars) {
      languageScores['uk-UA'] = cyrillicRatio * 100 + ukWordCount * 8 + (hasUkrainianChars ? 30 : 0); // Higher weight for Ukrainian
    }
  }

  // Russian (Cyrillic) - only if Bulgarian and Ukrainian are not detected
  if (cyrillicRatio > 0.1 && !languageScores['bg-BG'] && !languageScores['uk-UA']) {
    const ruWords = [
      'это',
      'что',
      'как',
      'или',
      'для',
      'но',
      'не',
      'на',
      'по',
      'из',
      'от',
      'до',
      'за',
      'быть',
      'был',
      'была',
      'было',
      'были',
      'все',
      'всего',
      'всегда',
      'когда',
      'где',
      'который',
      'которая',
      'которое',
      'которые',
    ];
    const ruWordCount = ruWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
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
  const deWords = [
    'der',
    'die',
    'das',
    'ist',
    'und',
    'ein',
    'eine',
    'nicht',
    'ich',
    'sie',
    'es',
    'sind',
    'mit',
    'auf',
    'für',
    'von',
    'zu',
    'den',
    'dem',
  ];
  const deWordCount = deWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasGermanChars = /[äöüßÄÖÜ]/.test(text);
  if (deWordCount > 0 || hasGermanChars) {
    languageScores['de-DE'] = deWordCount * 3 + (hasGermanChars ? 10 : 0);
  }

  // French
  const frWords = [
    'le',
    'les',
    'des',
    'je',
    'tu',
    'il',
    'est',
    'dans',
    'pour',
    'avec',
    'sur',
    'qui',
    'nous',
    'vous',
    'leur',
    'fait',
    'tout',
    'peut',
    'mais',
    'cette',
  ];
  const frWordCount = frWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasFrenchChars = /[âêîôûëïüÿç]/.test(text); // More specific French chars
  if (frWordCount > 0 || hasFrenchChars) {
    languageScores['fr-FR'] = frWordCount * 3 + (hasFrenchChars ? 15 : 0);
  }

  // Spanish
  const esWords = [
    'el',
    'la',
    'los',
    'las',
    'un',
    'una',
    'es',
    'en',
    'de',
    'que',
    'por',
    'para',
    'con',
    'sobre',
    'entre',
    'ser',
    'estar',
    'tener',
    'hacer',
    'ir',
  ];
  const esWordCount = esWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasSpanishChars = /[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text);
  if (esWordCount > 0 || hasSpanishChars) {
    languageScores['es-ES'] = esWordCount * 3 + (hasSpanishChars ? 10 : 0);
  }

  // Portuguese
  const ptWords = [
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'de',
    'em',
    'para',
    'com',
    'não',
    'é',
    'ser',
    'estar',
    'ter',
    'fazer',
    'ir',
    'vir',
    'pelo',
    'pela',
  ];
  const ptWordCount = ptWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasPortugueseChars = /[ãõçÃÕÇ]/.test(text);
  if (ptWordCount > 0 || hasPortugueseChars) {
    languageScores['pt-PT'] = ptWordCount * 3 + (hasPortugueseChars ? 10 : 0);
  }

  // Italian
  const itWords = [
    'che',
    'gli',
    'dello',
    'della',
    'degli',
    'delle',
    'nel',
    'nella',
    'nei',
    'nelle',
    'sono',
    'hanno',
    'questo',
    'quella',
    'questi',
    'più',
    'anche',
    'come',
    'molto',
    'cosa',
  ];
  const itWordCount = itWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasItalianChars = /[àèéìòù]/.test(text); // Italian accents
  const hasItalianDoubleConsonants = /[bcdfglmnpqrstvz]{2}/.test(text.toLowerCase()); // Common in Italian
  if (itWordCount > 0 || hasItalianChars) {
    languageScores['it-IT'] = itWordCount * 4 + (hasItalianChars ? 15 : 0) + (hasItalianDoubleConsonants ? 5 : 0);
  }

  // Polish - only give full char bonus when density is sufficient or Polish words found
  const hasPolishUniqueChars = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(text);
  const plWords = [
    'jest',
    'się',
    'że',
    'jak',
    'nie',
    'ale',
    'dla',
    'być',
    'może',
    'która',
    'który',
    'przez',
    'więc',
    'oraz',
    'także',
    'tylko',
    'już',
    'jeszcze',
    'gdy',
    'gdzie',
    'wszystko',
    'wszystkie',
    'wszystkich',
    'którego',
    'której',
    'których',
    'którym',
    'którymi',
  ];
  const plWordCount = plWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasPolishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text);
  const plCharCount = (text.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g) || []).length;
  const plCharRatio = plCharCount / text.length;
  if (plWordCount > 0 || plCharRatio > 0.01) {
    const uniqueCharBonus = hasPolishUniqueChars && (plWordCount >= 1 || plCharRatio > 0.015) ? 30 : 0;
    const charBonus = hasPolishChars && (plWordCount >= 1 || plCharRatio > 0.01) ? 15 : 0;
    languageScores['pl-PL'] = plWordCount * 4 + charBonus + uniqueCharBonus;
  }

  // Swedish
  const svWords = [
    'och',
    'är',
    'som',
    'för',
    'att',
    'det',
    'med',
    'på',
    'av',
    'till',
    'om',
    'inte',
    'den',
    'han',
    'hon',
    'var',
    'kan',
    'ska',
    'så',
    'men',
    'eller',
    'när',
    'där',
    'här',
    'från',
    'över',
    'under',
    'efter',
    'innan',
    'mellan',
  ];
  const svWordCount = svWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasSwedishChars = /[åäöÅÄÖ]/.test(text);
  if (svWordCount > 0 || hasSwedishChars) {
    languageScores['sv-SE'] = svWordCount * 3 + (hasSwedishChars ? 15 : 0);
  }

  // Danish
  const daWords = [
    'og',
    'er',
    'som',
    'for',
    'at',
    'det',
    'med',
    'på',
    'af',
    'til',
    'om',
    'ikke',
    'den',
    'han',
    'hun',
    'var',
    'kan',
    'skal',
    'så',
    'men',
    'eller',
    'når',
    'der',
    'her',
    'fra',
    'over',
    'under',
    'efter',
    'før',
    'mellem',
  ];
  const daWordCount = daWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasDanishChars = /[åæøÅÆØ]/.test(text);
  if (daWordCount > 0 || hasDanishChars) {
    languageScores['da-DK'] = daWordCount * 3 + (hasDanishChars ? 15 : 0);
  }

  // Finnish
  const fiWords = [
    'ja',
    'on',
    'joka',
    'tai',
    'että',
    'se',
    'tämä',
    'hän',
    'oli',
    'ovat',
    'voidaan',
    'voi',
    'ei',
    'mutta',
    'kun',
    'missä',
    'tässä',
    'siellä',
    'täältä',
    'yli',
    'alla',
    'jälkeen',
    'ennen',
    'välillä',
    'kanssa',
    'ilman',
    'varten',
    'kohti',
    'vastaan',
    'lähellä',
  ];
  const fiWordCount = fiWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasFinnishChars = /[äöÄÖ]/.test(text);
  if (fiWordCount > 0 || hasFinnishChars) {
    languageScores['fi-FI'] = fiWordCount * 3 + (hasFinnishChars ? 10 : 0);
  }

  // Norwegian
  const noWords = [
    'og',
    'er',
    'som',
    'for',
    'at',
    'det',
    'med',
    'på',
    'av',
    'til',
    'om',
    'ikke',
    'den',
    'han',
    'hun',
    'var',
    'kan',
    'skal',
    'så',
    'men',
    'eller',
    'når',
    'der',
    'her',
    'fra',
    'over',
    'under',
    'etter',
    'før',
    'mellom',
  ];
  const noWordCount = noWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasNorwegianChars = /[åæøÅÆØ]/.test(text);
  if (noWordCount > 0 || hasNorwegianChars) {
    languageScores['nb-NO'] = noWordCount * 3 + (hasNorwegianChars ? 15 : 0);
  }

  // Turkish
  const trWords = [
    've',
    'bir',
    'bu',
    'şu',
    'o',
    'ile',
    'için',
    'gibi',
    'kadar',
    'göre',
    'karşı',
    'doğru',
    'içinde',
    'üzerinde',
    'altında',
    'yanında',
    'sonra',
    'önce',
    'arasında',
    'ile',
    'ama',
    'fakat',
    'ancak',
    'çünkü',
    'eğer',
    'ki',
    'de',
    'da',
    'mi',
    'mı',
  ];
  const trWordCount = trWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasTurkishChars = /[çğıöşüÇĞİÖŞÜ]/.test(text); // 注意：不含拉丁大写 I，避免英文 "I" 误判
  if (trWordCount > 0 || hasTurkishChars) {
    languageScores['tr-TR'] = trWordCount * 3 + (hasTurkishChars ? 15 : 0);
  }

  // Dutch
  const nlWords = [
    'de',
    'het',
    'een',
    'en',
    'van',
    'in',
    'op',
    'voor',
    'met',
    'te',
    'aan',
    'dat',
    'die',
    'is',
    'zijn',
    'was',
    'waren',
    'kan',
    'kunnen',
    'moet',
    'moeten',
    'zal',
    'zullen',
    'maar',
    'of',
    'als',
    'dan',
    'om',
    'naar',
    'over',
  ];
  const nlWordCount = nlWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasDutchChars = /[ëïËÏ]/.test(text);
  if (nlWordCount > 0 || hasDutchChars) {
    languageScores['nl-NL'] = nlWordCount * 3 + (hasDutchChars ? 10 : 0);
  }

  // Greek
  const elChars = (text.match(/[\u0370-\u03FF]/g) || []).length;
  const elRatio = elChars / text.length;
  if (elRatio > 0.1) {
    const elWords = [
      'και',
      'το',
      'της',
      'του',
      'των',
      'από',
      'για',
      'με',
      'σε',
      'στο',
      'στη',
      'στα',
      'στην',
      'στον',
      'είναι',
      'ήταν',
      'έχει',
      'έχουν',
      'μπορεί',
      'μπορούν',
      'αλλά',
      'ή',
      'όταν',
      'όπου',
      'πως',
      'γιατί',
    ];
    const elWordCount = elWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
    languageScores['el-GR'] = elRatio * 100 + elWordCount * 3;
  }

  // Czech - only give full char bonus when density is sufficient or Czech words found
  const csWords = [
    'když',
    'kde',
    'který',
    'která',
    'které',
    'kterou',
    'kterým',
    'kterými',
    'nebo',
    'protože',
    'pokud',
    'kdy',
    'jak',
    'co',
    'kdo',
    'člověk',
    'český',
    'česká',
    'české',
    'českých',
    'českým',
    'českými',
    'přes',
    'před',
    'při',
    'pod',
    'nad',
    'mezi',
    'bez',
    'kromě',
    'místo',
    'kvůli',
    'díky',
    'během',
    'podle',
    'kolem',
    'okolo',
  ];
  const csWordCount = csWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
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
  const huWords = [
    'és',
    'a',
    'az',
    'egy',
    'hogy',
    'van',
    'volt',
    'lesz',
    'lehet',
    'kell',
    'kellene',
    'kellett',
    'mint',
    'mint',
    'mint',
    'vagy',
    'de',
    'hanem',
    'mert',
    'ha',
    'amikor',
    'ahol',
    'ahogy',
    'mi',
    'miért',
    'hogyan',
    'melyik',
    'mely',
    'ki',
    'mit',
  ];
  const huWordCount = huWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasHungarianChars = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(text);
  if (huWordCount > 0 || hasHungarianChars) {
    languageScores['hu-HU'] = huWordCount * 3 + (hasHungarianChars ? 15 : 0);
  }

  // Romanian
  const roWords = [
    'și',
    'cu',
    'în',
    'pe',
    'la',
    'de',
    'pentru',
    'că',
    'este',
    'sunt',
    'era',
    'erau',
    'poate',
    'pot',
    'trebuie',
    'trebuia',
    'va',
    'vor',
    'dar',
    'sau',
    'dacă',
    'când',
    'unde',
    'cum',
    'ce',
    'care',
    'carele',
    'carea',
    'carei',
    'carele',
  ];
  const roWordCount = roWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
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

  // Arabic (already handled above, but ensure it's prioritized)
  // The Arabic detection is already in the code above

  // Hebrew (Hebrew script)
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const hebrewRatio = hebrewChars / text.length;
  if (hebrewRatio > 0.1) {
    languageScores['he-IL'] = hebrewRatio * 100;
  }

  // Vietnamese
  const viWords = [
    'và',
    'của',
    'trong',
    'với',
    'cho',
    'từ',
    'đến',
    'về',
    'theo',
    'sau',
    'trước',
    'giữa',
    'là',
    'có',
    'được',
    'sẽ',
    'đã',
    'đang',
    'nhưng',
    'hoặc',
    'nếu',
    'khi',
    'ở',
    'đâu',
    'gì',
    'ai',
    'nào',
    'sao',
    'tại',
    'vì',
  ];
  const viWordCount = viWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  const hasVietnameseChars =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(
      text
    );
  if (viWordCount > 0 || hasVietnameseChars) {
    languageScores['vi-VN'] = viWordCount * 3 + (hasVietnameseChars ? 20 : 0);
  }

  // English (default for Latin script)
  const enWords = [
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'can',
    'could',
    'should',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'from',
    'this',
    'that',
    'these',
    'those',
    'what',
    'when',
    'where',
    'why',
    'how',
    'it',
    'as',
    'by',
    'so',
    'if',
    'no',
    'not',
    'all',
    'each',
    'other',
    'new',
    'first',
    'one',
    'time',
    'people',
    'year',
    'way',
    'made',
    'after',
    'before',
  ];
  const enWordCount = enWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lowerText)).length;
  if (enWordCount > 0) {
    languageScores['en-US'] = enWordCount * 3;
  }

  // If no scores, default to English
  if (Object.keys(languageScores).length === 0) {
    return 'en-US';
  }

  // Find language with highest score
  // 平局时优先选择有对应音色的语言（MiMo 仅提供中英文音色），
  // 避免常见短词误判（如英文被误判为土耳其语）导致选中小语种而无可用音色
  const VOICE_SUPPORTED_LANGS = ['zh-CN', 'en-US'];
  let maxScore = 0;
  let detectedLang = 'en-US';

  for (const [lang, score] of Object.entries(languageScores) as [string, number][]) {
    const winsTie = score === maxScore && VOICE_SUPPORTED_LANGS.includes(lang) && !VOICE_SUPPORTED_LANGS.includes(detectedLang);
    if (score > maxScore || winsTie) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  logger.debug('Scores:', languageScores, '→ Selected:', detectedLang);
  return detectedLang;
}
