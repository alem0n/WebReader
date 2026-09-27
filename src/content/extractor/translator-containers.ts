/**
 * 第三方网页翻译器的「译文容器」识别。
 *
 * 背景：kiss-translator 等翻译器会把网页正文改造成「原文 + 译文」结构。
 * 在「仅译文」模式（原文隐藏、只显示译文）下，页面实际可朗读的内容只剩下
 * 译文容器内的文本，而原文被搬进惰性 <template> 备份，不在渲染树中。
 *
 * 采集器默认把 `.notranslate` 当作噪声忽略（见 selectors.ts），而 kiss 恰好
 * 用 `notranslate` 给译文容器打标记，导致整页朗读在仅译文模式下采集为空。
 * 本模块负责把这类「承载页面可见正文的译文容器」与真正的噪声区分开。
 *
 * 目前仅覆盖 kiss-translator（APP_LCNAME = "kiss-translator"）。出现第二个
 * 需要兼容的翻译器时，再把这里抽象成通用的译文容器识别层。
 */

/** kiss-translator 译文容器选择器（自定义元素 <kiss-translator>） */
export const KISS_WRAPPER_SELECTOR = '.kiss-translator-wrapper';

/** kiss-translator 原文备份选择器（仅译文模式下原文被搬进的惰性 template） */
export const KISS_BACKUP_SELECTOR = 'template.kiss-translator-backup';

/**
 * 元素是否为 kiss-translator「仅译文」模式的译文容器。
 *
 * 判定依据：是译文容器，且内部含有原文备份 template。备份 template 只在原文
 * 被隐藏（仅译文模式）时才创建（kiss-translator 的 #removeOriginal /
 * #toggleTranslationOnly），因此该条件等价于「原文已隐藏、译文是页面可见正文」。
 *
 * 不把双语模式的容器算进来：双语模式原文仍在渲染树中并被正常采集，
 * 译文不应重复朗读。
 */
export function isKissTranslationOnlyWrapper(el: Element): boolean {
  if (!el.matches?.(KISS_WRAPPER_SELECTOR)) return false;
  return !!el.querySelector(KISS_BACKUP_SELECTOR);
}
