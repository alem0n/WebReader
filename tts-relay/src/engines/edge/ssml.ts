/**
 * SSML 构造：voice + prosody(rate/pitch/volume)。
 *
 * 语速 → 百分比映射并钳制到 Edge 允许区间 -50%..+100%
 * （provider 特有逻辑，不下沉到扩展 shared）：
 *   speed 0.5 → "-50%"，1.0 → "+0%"，2.0 → "+100%"
 */

/** 语速（倍率）→ Edge prosody rate 百分比，钳制 -50%..+100% */
export function speedToRatePercent(speed: number): string {
  const clamped = Math.min(2.0, Math.max(0.5, speed));
  const percent = Math.round((clamped - 1.0) * 100);
  const safe = Math.min(100, Math.max(-50, percent));
  return `${safe >= 0 ? '+' : ''}${safe}%`;
}

/** 从音色名提取 xml:lang（如 zh-CN-XiaoxiaoNeural → zh-CN） */
export function inferLangFromVoice(voice: string): string {
  const match = /^([a-z]{2}-[A-Z]{2})/i.exec(voice);
  return match ? match[1] : 'en-US';
}

export interface SsmlOptions {
  voice: string;
  text: string;
  /** 语速倍率（0.5..2.0），1.0 为自然语速 */
  speed?: number;
  /** xml:lang，省略时由音色名推断 */
  lang?: string;
  /** 音调（Hz 偏移），默认 +0Hz */
  pitch?: string;
  /** 音量（百分比），默认 +0% */
  volume?: string;
}

export function buildSsml(options: SsmlOptions): string {
  const lang = options.lang || inferLangFromVoice(options.voice);
  const rate = speedToRatePercent(options.speed ?? 1.0);
  const pitch = options.pitch ?? '+0Hz';
  const volume = options.volume ?? '+0%';
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${options.voice}">` +
    `<prosody pitch="${pitch}" rate="${rate}" volume="${volume}">${options.text}</prosody>` +
    `</voice></speak>`
  );
}
