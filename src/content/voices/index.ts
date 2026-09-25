/**
 * voices —— 音色目录的加载与下拉交互。
 *
 * 原单文件 voices.ts 560 行（docs/tech-debt.md TD-010），按职责拆为本目录：
 *  - format.ts：音色显示格式化（纯函数）
 *  - loader.ts：缓存读写 + 预置音色拉取 + 重试
 *  - dropdown.ts：过滤 / 渲染 / 选择 / 高亮
 *
 * 本文件只做聚合再导出，保持 '../voices' 的对外契约不变。
 */
export { formatVoiceName, formatVoiceDisplayName } from './format';
export { clearVoicesCache, loadVoices } from './loader';
export { filterVoices, renderVoiceDropdown, selectVoice, updateHighlightedOption } from './dropdown';
