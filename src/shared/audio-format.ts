/** base64 解码与音频格式探测（按魔数判断真实格式，避免 MIME 与字节不匹配导致无法解码） */

/** 将 base64 字符串解码为字节数组（容忍可能存在的 data: 前缀） */
export function base64ToBytes(base64: string): Uint8Array {
  let b64 = String(base64 || '').trim();
  // 容忍 MiMo 偶尔返回带前缀的 data URL
  const commaIdx = b64.indexOf(',');
  if (commaIdx > -1 && b64.slice(0, 5).toLowerCase() === 'data:') {
    b64 = b64.slice(commaIdx + 1);
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface AudioFormat {
  /** 探测到的 MIME，未知时为空串 */
  mime: string;
  /** 可读描述 */
  desc: string;
}

/** 按魔数探测音频真实格式，返回正确的 MIME */
export function detectAudioFormat(bytes: Uint8Array): AudioFormat {
  const len = bytes.length;
  const head = len >= 4 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : '';
  if (head === 'RIFF' && len >= 12 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WAVE') {
    return { mime: 'audio/wav', desc: 'WAV/RIFF' };
  }
  // MP3: ID3v2 头 或 帧同步 0xFFEx/0xFFFx
  if (head === 'ID3\x03' || (len >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { mime: 'audio/mpeg', desc: 'MP3' };
  }
  if (head === 'OggS') return { mime: 'audio/ogg', desc: 'Ogg' };
  if (head === 'fLaC') return { mime: 'audio/flac', desc: 'FLAC' };
  // MP4/M4A: "ftyp" 出现在 4~7 字节
  if (len >= 8 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp') {
    return { mime: 'audio/mp4', desc: 'MP4/M4A' };
  }
  return { mime: '', desc: 'unknown' };
}

/** 字节数组转十六进制（调试日志用） */
export function bytesToHex(bytes: Uint8Array, n = 16): string {
  return Array.from(bytes.slice(0, n))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}
