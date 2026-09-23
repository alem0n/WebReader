/** base64 / data URL → Blob（播放器消费的音频二进制） */

/**
 * 将 base64 或 data URL 转为 Blob。
 * 若传入 data URL，优先采用其中声明的 MIME（与实际字节一致）。
 */
export function base64ToBlob(dataUrl: string, type?: string): Blob {
  const str = String(dataUrl || '');
  let mime = type || 'audio/wav';
  let base64 = str;
  if (str.slice(0, 5).toLowerCase() === 'data:') {
    const commaIdx = str.indexOf(',');
    if (commaIdx > -1) {
      const meta = str.slice(5, commaIdx); // 形如 audio/mpeg;base64
      if (meta) mime = meta.split(';')[0] || mime;
      base64 = str.slice(commaIdx + 1);
    }
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
