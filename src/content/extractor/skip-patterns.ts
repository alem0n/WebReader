/**
 * 文本噪声过滤（移植自 kiss-translator 的 BUILTIN_SKIP_PATTERNS）。
 *
 * 只过滤短噪声与 URL/数字等；不做 maxLength 上限过滤（长段落本身就是正文，
 * 不能丢），超长切分交给下游 SentencePlayer.capLongSentences 兜底。
 */

const BUILTIN_SKIP_PATTERNS: RegExp[] = [
  // 1. URL (http, https, ftp, file, www)
  /^(?:(?:https?|ftp|file):\/\/|www\.)[^\s/$.?#].[^\s]*$/i,
  // 2. 邮箱
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  // 3. 文件路径 (Unix / Windows)
  /^(?:[a-zA-Z]:\\|\/|\\)(?:[\w\-. ]+\/|[\w\-. ]+\\)*[\w\-. ]*\.?[\w\-. ]*$/,
  // 4. UUID
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  // 5. 纯数字（含千分位、小数、货币符号与单位）
  /^[$\u00A2-\u00A5\u20A0-\u20CF]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s?(?:px|%|em|rem|pt|vw|vh|deg|s|ms)?$/,
  // 6. 版本号 (v1.2.3, 10.0.1)
  /^v?\d+(\.\d+){1,3}$/,
  // 7. ISO 8601 日期/时间
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
  // 8. 模板占位符 ({{var}}, ${var}, __VAR__, %s)
  /^({{[^}]+}}|\${[^}]+}|__\w+__|%\w+)$/,
  // 9. CSS 选择器 / 十六进制颜色
  /^(?:\.|#)[\w-]+$|^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  // 10. 用户名 (@username)
  /^@[\w.-]+$/,
  // 11. HTML 实体
  /^&\w+;$/,
  // 12. 中括号序号 ([1], [99])
  /^\[\d+\]$/,
  // 13. 简单时间 (12:30, 9:45:30)
  /^\d{1,2}:\d{2}(:\d{2})?$/,
  // 14. 常见扩展名文件名 (document.pdf)
  /^[^\s\\/:]+?\.[a-zA-Z0-9]{2,5}$/,
];

/** 触发采集的最小文本字符数（过短字符如单个字母不予采集） */
const MIN_TEXT_LENGTH = 2;

const combinedSkipsRegex = new RegExp(BUILTIN_SKIP_PATTERNS.map((r) => `(${r.source})`).join('|'));

/** 文本是否值得朗读：非空、够长、非纯数字、非 URL/版本号等噪声 */
export function isValidText(text: string): boolean {
  if (typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length < MIN_TEXT_LENGTH) return false;

  // 单个非字母字符
  if (trimmed.length === 1 && !/[a-zA-Z]/.test(trimmed)) return false;

  // 纯数字（整串可解析为有限数字才排除，"3.14美元" 之类保留）
  if (!isNaN(parseFloat(trimmed)) && Number.isFinite(Number(trimmed))) {
    return false;
  }

  if (combinedSkipsRegex.test(trimmed)) return false;

  return true;
}
