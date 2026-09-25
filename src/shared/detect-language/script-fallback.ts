/**
 * 短文本（<20 字）语言检测：跳过词频统计，仅按字符脚本判定。
 *
 * 保证短中文 / 日文 / 韩文 / 西里尔 / 阿拉伯 / 印地 / 希伯来等不被回退为英文；
 * 拉丁或未知脚本返回 null，由调用方按场景兜底。假名优先于汉字：同时含汉字与
 * 假名时判定为日文。
 */
export function detectByScriptShortText(text: string): string | null {
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja-JP'; // 假名优先于汉字
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text)) return 'zh-CN';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
  if (/[\u0590-\u05FF]/.test(text)) return 'he-IL';
  return null; // 拉丁/未知短文本保持 null，由调用方按脚本回退
}
