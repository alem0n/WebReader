/**
 * 通配符匹配（移植自 kiss-translator libs/utils.js 的 isMatch），
 * 供站点规则按网址匹配使用。
 */

function isAllChar(s: string, ch: string, start: number): boolean {
  for (let i = start; i < s.length; i++) {
    if (s[i] !== ch) return false;
  }
  return true;
}

/** 支持 * 通配符的字符串匹配（pattern 隐含首尾通配） */
export function isMatch(s: string, p: string): boolean {
  if (s.length === 0 || p.length === 0) return false;

  p = '*' + p + '*';

  let sIndex = 0;
  let pIndex = 0;
  let sRecord = -1;
  let pRecord = -1;

  while (sIndex < s.length && pRecord < p.length) {
    if (p[pIndex] === '*') {
      pIndex++;
      sRecord = sIndex;
      pRecord = pIndex;
    } else if (s[sIndex] === p[pIndex]) {
      sIndex++;
      pIndex++;
    } else if (sRecord + 1 < s.length) {
      sRecord++;
      sIndex = sRecord;
      pIndex = pRecord;
    } else {
      return false;
    }
  }

  if (p.length === pIndex) return true;
  return isAllChar(p, '*', pIndex);
}

/** 逗号/换行分隔的多模式按 URL 匹配（移植自 matchesRulePattern） */
export function matchesRulePattern(href: string, pattern: string): boolean {
  return pattern.split(/\n|,/).some((token) => {
    const p = token.trim();
    return p.length > 0 && isMatch(href, p);
  });
}
