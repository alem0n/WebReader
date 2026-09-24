/**
 * 语言检测公开入口（原 `detect-language.ts`）。
 *
 * 短文本（<20 字）按字符脚本直接判定（script-fallback）；长文本进入加权评分
 * （scoring）后取最高分，平局时优先选择有对应音色的语言——避免常见短词误判
 * （如英文被误判为土耳其语）导致选中小语种而无可用音色。对外签名与结果不变。
 */
import { createLogger } from '../log';
import { detectByScriptShortText } from './script-fallback';
import { scoreLanguages } from './scoring';

const logger = createLogger('WebReader/detect-language');

/** 平局时优先选择的语言（MiMo 仅提供中英文音色） */
const VOICE_SUPPORTED_LANGS = ['zh-CN', 'en-US'];

export function detectLanguage(text: string) {
  if (!text) return null;

  // 短文本（<20字）跳过词频统计，仅按字符脚本判断，
  // 保证短中文/日文/韩文/西里尔/阿拉伯等不被回退为英文
  if (text.length < 20) {
    return detectByScriptShortText(text);
  }

  const languageScores = scoreLanguages(text);

  // If no scores, default to English
  if (Object.keys(languageScores).length === 0) {
    return 'en-US';
  }

  // Find language with highest score
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
