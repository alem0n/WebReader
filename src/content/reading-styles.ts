/**
 * reading-styles.ts —— 网页内逐句高亮的样式层
 *
 * 注入策略移植自 kiss-translator 的 libs/style.js + translator.js 的样式注入
 * （#createTextStyles / #injectSheet / #injectSheetFallback），去掉 @emotion 依赖：
 * 优先可构造样式表（CSSStyleSheet + document.adoptedStyleSheets），失败时
 * （如部分环境不支持/受限）回退到 document.head 的 <style> 元素；调用幂等。
 *
 * 与旧「跟读显示」样式的关键差异：高亮只在**原位**给当前句子加半透明底色与轮廓，
 * 原文始终清晰可读——不覆盖、不替换任何页面内容，因此不需要多种「译文样式」。
 */

/** DOM 类名（统一 tts-reading- 前缀，避免与页面既有类名冲突） */
export const READING_CLASS = {
  /** 包裹某个句子字符区间的 span（一句可能跨多个行内元素边界，故可能多段） */
  sentence: 'tts-reading-sentence',
  /** 当前正在朗读的句子高亮 */
  active: 'tts-reading-active',
} as const;

const STYLE_ELEMENT_ID = 'tts-reading-styles';
const ACCENT = '88, 204, 2'; // #58cc02 的 RGB 分量（Duolingo 进度绿），用于半透明叠加

function buildReadingStylesheet(): string {
  const { sentence, active } = READING_CLASS;
  return [
    // 基础态：完全透明，不影响页面排版与配色；box-decoration-break 使多行高亮不断裂
    `span.${sentence} { background-color: transparent; color: inherit; box-decoration-break: clone; -webkit-box-decoration-break: clone; }`,
    // 激活态（正在朗读）与悬停态共用同一组高亮样式：悬停预览与正在朗读样式完全一致，
    // 调整一处即两处同步；cursor:pointer 提示该句可点击跳转。
    // 高亮底色改为从下到上逐渐递减的线性渐变：底部最浓（alpha 0.32，与原纯色一致），
    // 向上渐隐为透明；颜色仍为 ACCENT（#58cc02），仅改变填充形式
    `span.${sentence}.${active}, span.${sentence}:hover {
      background-image: linear-gradient(to top, rgba(${ACCENT}, 0.32), rgba(${ACCENT}, 0));
      border-radius: 2px;
      cursor: pointer;
    }`,
  ].join('\n');
}

let injected = false;

/** 幂等地注入高亮样式表（可构造样式表优先，<style> 回退） */
export function injectReadingStyles(): void {
  if (injected) return;
  injected = true;

  const cssText = buildReadingStylesheet();
  let applied = false;

  if (typeof CSSStyleSheet === 'function') {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      const doc = document as Document & { adoptedStyleSheets?: CSSStyleSheet[] };
      doc.adoptedStyleSheets = [...(doc.adoptedStyleSheets || []), sheet];
      applied = true;
    } catch {
      // 跨作用域限制或 CSP：降级为 <style> 元素
    }
  }

  if (!applied) injectFallbackStyle(cssText);
}

/** 回退方案：通过 <style> 元素注入（兼容不支持/受限 adoptedStyleSheets 的环境） */
function injectFallbackStyle(cssText: string): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = cssText;

  const parent = document.head || document.documentElement;
  if (parent) parent.appendChild(style);
}
