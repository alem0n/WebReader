/**
 * 正文采集器的选择器常量（移植自 kiss-translator config/rules.js）。
 *
 * 采集是**只读**的：这些选择器只用于 querySelector / matches / closest，
 * 绝不注入或修改页面 DOM。
 */

/** 显式模式下的默认正文元素选择器 */
export const DEFAULT_SELECTOR = 'h1, h2, h3, h4, h5, h6, li, p, dd, blockquote, figcaption, label, legend';

/** 默认忽略：按钮、页脚、代码块、导航、矢量图、Logo */
export const DEFAULT_IGNORE_SELECTOR = "button, footer, pre, mark, nav, svg, img[src*='.svg'], [class*='logo'] svg, [id*='logo'] svg";

/**
 * 内置忽略：不可朗读或无意义的元素（autoScan 智能扫描模式下生效）。
 *
 * 相对 kiss 的增强：TTS 只读正文，页面外壳（nav/header/footer/aside）即使不含
 * 「正文」也一律排除。这些角色在现代页面里几乎只承载导航/工具栏/页脚，
 * 遍历的栈剪枝会跳过命中节点的整个子树，因此无需 closest 逐节点回溯。
 * 已知取舍：文章内 <header> 中的标题会被一并排除（与旧版 collectPageText 行为一致）。
 */
export const BUILTIN_IGNORE_SELECTOR = `address, area, audio, br, canvas,
data, datalist, embed, head, iframe, input, noscript, map,
object, option, param, picture, progress,
select, script, style, svg, track, textarea, template,
video, wbr, .notranslate, [contenteditable='true'], [translate='no'],
nav, header, footer, aside`;

/** 本扩展自身注入页面的 DOM，绝不参与采集 */
export const SELF_IGNORE_SELECTOR =
  '#tts-widget-host, #tts-selection-button-host, #tts-context-invalidated-toast, ' +
  // 网页内逐句高亮注入的句子 span，防止重新采集时把已包裹的文本当正文重复朗读
  'span.tts-reading-sentence';
