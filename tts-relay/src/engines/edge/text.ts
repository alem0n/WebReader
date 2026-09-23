/**
 * 文本预处理（不做会被服务端拒绝）：
 * - 控制字符 0x00-0x08 / 0x0B-0x0C / 0x0E-0x1F → 空格（OCR 文本里的垂直制表符会让服务端报错）
 * - XML 转义（& < > " '）
 * - 每 4096 字节切一段（UTF-8 与字符边界安全切分）
 */

/** 控制字符 → 空格（保留 \t \n \r，其余 0x00-0x08/0x0B-0x0C/0x0E-0x1F 替换） */
export function stripControlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
}

/** XML 转义（SSML 体内容） */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 在 XML 实体边界安全切分：不在 &xxx; 中间断开 */
export function splitTextOnEntityBoundary(text: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  const result: string[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.length > 0) {
      result.push(buffer);
      buffer = '';
    }
  };

  // 遍历字符（码点，代理对安全），逐字累加；遇到 & 则读到 ; 再处理
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    let piece: string;

    if (ch === '&') {
      // 读到分号或非实体字符为止
      let j = i + 1;
      while (j < text.length && j < i + 10 && text[j] !== ';' && /[A-Za-z0-9#]/.test(text[j])) {
        j++;
      }
      if (j < text.length && text[j] === ';') {
        piece = text.slice(i, j + 1);
        i = j + 1;
      } else {
        piece = ch;
        i++;
      }
    } else {
      piece = ch;
      i++;
    }

    // 加入 piece 会超限时先切分
    if (encoder.encode(buffer + piece).byteLength > maxBytes) {
      flush();
      // 单个 piece 本身超限（极少见，如超长实体）：按字节硬切
      if (encoder.encode(piece).byteLength > maxBytes) {
        const bytes = encoder.encode(piece);
        for (let k = 0; k < bytes.length; k += maxBytes) {
          const slice = bytes.subarray(k, k + maxBytes);
          result.push(new TextDecoder().decode(slice));
        }
        continue;
      }
    }
    buffer += piece;
  }
  flush();

  return result;
}

/** 完整预处理：控制字符清洗 + XML 转义 + 按字节切段 */
export function prepareTextForSynthesis(text: string, maxBytes: number): string[] {
  const cleaned = stripControlChars(text);
  const escaped = escapeXml(cleaned);
  return splitTextOnEntityBoundary(escaped, maxBytes);
}
