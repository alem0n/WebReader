/**
 * player —— 朗读播放器。
 *
 * 原单文件 player.ts 905 行（docs/tech-debt.md TD-004），按职责拆为本目录：
 *  - playback：开始播放（暂停 / 恢复 / 新播放三态判定与启动序列）
 *  - chunk：单句播放循环（MiMo Web Audio 管线 + 本地音色容灾）
 *  - navigation：上一句 / 下一句 / 跳到任意句（防抖 + 请求作废）
 *  - entire-page：整页朗读主流程与句子映射（pageTextUnits / pageTextMap）生命周期
 *  - stop-clear：停止 / 清空
 *  - paste：粘贴并朗读 / Google Docs 引导
 *  - scroll：文本框的句子滚动跟随
 *
 * 本文件只做聚合再导出，保持 '../player' 的对外契约不变；onSentenceChanged /
 * refreshMapIfStale / scrollToCurrentChunk 等为子模块间的内部协作，不再导出。
 */
export { handlePlayPause } from './playback';
export { playSentenceChunk } from './chunk';
export { jumpToSentence, handlePrev, handleNext } from './navigation';
export { collectPageText, playEntirePage, refreshInlineReading } from './entire-page';
export { handleStop, handleClear } from './stop-clear';
export { handlePaste } from './paste';
