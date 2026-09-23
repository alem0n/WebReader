/**
 * 本地 TTS 容灾后备（plan.md 阶段 5）。
 *
 * 移植自 kiss-translator libs/speech.js 的本地语音部分：BCP-47 归一化避免
 * Invalid lang、多终态只回调一次。**chrome.tts 在 content script 中不可用**（且需
 * 声明 tts 权限、只在扩展页可用），本项目容灾一律用 speechSynthesis —— 纯 Web API，
 * content 可直接调用，无需任何权限。
 *
 * 纯逻辑 + 环境探测，不持有任何层 state；本地朗读是 fire-and-forget utterance，
 * 由调用方（content/player.ts）另建路径承接 currentIndex 推进与 onEnd，
 * 不与 Web Audio 管线混用。
 */

interface LocalTtsCallbacks {
  /** 朗读结束（含出错，保证只回调一次） */
  onEnd?: () => void;
}

interface SpeakOptions extends LocalTtsCallbacks {
  /** 语速（speechSynthesis 范围 0.1–10，默认 1；本项目传入界面语速 0.5–2.5） */
  rate?: number;
}

/**
 * BCP-47 归一化：auto / und / detect / 非法形态统一兜底 en-US，避免 Invalid lang。
 * 对接 shared/detect-language 检测出的语言码（可能为 auto / und / 短文本回退值）。
 */
function normalizeLang(lang: string | undefined | null): string {
  const value = String(lang || '')
    .trim()
    .replace(/_/g, '-');
  const lowerValue = value.toLowerCase();

  if (
    !value ||
    lowerValue === 'en' ||
    lowerValue === 'auto' ||
    lowerValue === 'detect' ||
    lowerValue === 'und' ||
    lowerValue === 'unknown'
  ) {
    return 'en-US';
  }

  // 只保留简单的 BCP-47 形态，避免 Invalid lang
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value)) {
    return 'en-US';
  }

  return value;
}

/** 本地语音是否可用（speechSynthesis 是 content 侧唯一可用的本地引擎） */
export function canSpeak(): boolean {
  return (
    typeof speechSynthesis !== 'undefined' && typeof speechSynthesis.speak === 'function' && typeof SpeechSynthesisUtterance === 'function'
  );
}

/**
 * 用本地音色朗读一段文本（fire-and-forget utterance）。
 *
 * end / error 等多终态只回调一次 onEnd，保证与上层播放状态机衔接不重复触发。
 * @returns 是否成功启动（本地音色不可用时返回 false，调用方应降级为错误提示）
 */
export function speak(text: string, lang?: string | null, options: SpeakOptions = {}): boolean {
  const content = String(text || '').trim();
  if (!content || !canSpeak()) return false;

  let ended = false;
  const onEnd = (): void => {
    if (ended) return;
    ended = true;
    options.onEnd?.();
  };

  try {
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = normalizeLang(lang);
    utterance.rate = options.rate ?? 1;
    utterance.onend = onEnd;
    // 出错也视为结束，推进到下一句，避免播放卡住
    utterance.onerror = onEnd;
    speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** 停止本地朗读 */
export function cancel(): void {
  if (!canSpeak()) return;
  try {
    speechSynthesis.cancel();
  } catch {
    /* 本地音色异常忽略 */
  }
}

/** 暂停本地朗读 */
export function pause(): void {
  if (!canSpeak()) return;
  try {
    speechSynthesis.pause();
  } catch {
    /* 本地音色异常忽略 */
  }
}

/** 恢复本地朗读 */
export function resume(): void {
  if (!canSpeak()) return;
  try {
    speechSynthesis.resume();
  } catch {
    /* 本地音色异常忽略 */
  }
}
