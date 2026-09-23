/** 句子切分与播放进度管理（支持段落结构保留、长句拆分） */
import { createLogger } from './log';

const logger = createLogger('WebReader/sentence-player');

export class SentencePlayer {
  sentences: string[] = [];
  paragraphBreakAfterIndex: Set<number> = new Set();
  currentIndex = 0;
  isPlaying = false;
  isPaused = false;
  audioUrls: string[] = []; // 待清理的 object URL

  getDisplaySeparatorAfter(index: number): string {
    if (!this.paragraphBreakAfterIndex || index < 0 || index >= this.sentences.length - 1) return ' ';
    return this.paragraphBreakAfterIndex.has(index) ? '\n\n' : ' ';
  }

  getDisplayText(): string {
    const s = this.sentences;
    if (!s.length) return '';
    const parts: string[] = [];
    for (let i = 0; i < s.length; i++) {
      parts.push(s[i]);
      if (i < s.length - 1) parts.push(this.getDisplaySeparatorAfter(i));
    }
    return parts.join('');
  }

  mergeLowercaseContinuationSentences(sentences: string[]): string[] {
    const out: string[] = [];
    for (const cur of sentences) {
      const t = (cur || '').trim();
      if (!t) continue;
      if (out.length) {
        const prev = out[out.length - 1];
        const prevEnd = prev.trimEnd();
        const prevEndsDot = /[.\u2026]\s*$/u.test(prevEnd) || /<DOT>\s*$/u.test(prevEnd);
        const curStartsLower = /^\p{Ll}/u.test(t);
        if (prevEndsDot && curStartsLower) {
          out[out.length - 1] = `${prev} ${cur}`.replace(/ {2,}/g, ' ');
          continue;
        }
      }
      out.push(cur);
    }
    return out;
  }

  splitIntoSentences(text: string): string[] {
    let processed = (text || '').replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, ' ');
    // First, protect date-like numbers (e.g. 29.11.2025) from being split
    processed = processed.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g, '$1<DATE_DOT>$2<DATE_DOT>$3');

    // Then, protect decimal numbers from being split
    processed = processed.replace(/(\d+)\.(\d+)/g, '$1<DECIMAL>$2');

    // Handle common abbreviations and titles
    processed = processed
      .replace(/Mr\./gi, 'Mr<DOT>')
      .replace(/Mrs\./gi, 'Mrs<DOT>')
      .replace(/Ms\./gi, 'Ms<DOT>')
      .replace(/Miss\./gi, 'Miss<DOT>')
      .replace(/Dr\./gi, 'Dr<DOT>')
      .replace(/Prof\./gi, 'Prof<DOT>')
      .replace(/Sr\./gi, 'Sr<DOT>')
      .replace(/Jr\./gi, 'Jr<DOT>')
      .replace(/St\./g, 'St<DOT>') // Saint or Street
      .replace(/Ave\./g, 'Ave<DOT>')
      .replace(/Blvd\./g, 'Blvd<DOT>')
      .replace(/Rd\./g, 'Rd<DOT>')
      .replace(/Inc\./g, 'Inc<DOT>')
      .replace(/Ltd\./g, 'Ltd<DOT>')
      .replace(/Co\./g, 'Co<DOT>')
      .replace(/Corp\./g, 'Corp<DOT>')
      // Common Latin abbreviations
      .replace(/etc\./g, 'etc<DOT>')
      .replace(/vs\./g, 'vs<DOT>')
      .replace(/e\.g\./g, 'e<DOT>g<DOT>')
      .replace(/i\.e\./g, 'i<DOT>e<DOT>')
      .replace(/et al\./g, 'et al<DOT>')
      .replace(/cf\./g, 'cf<DOT>')
      // Academic degrees
      .replace(/Ph\.D\./g, 'Ph<DOT>D<DOT>')
      .replace(/M\.D\./g, 'M<DOT>D<DOT>')
      .replace(/B\.A\./g, 'B<DOT>A<DOT>')
      .replace(/M\.A\./g, 'M<DOT>A<DOT>')
      .replace(/B\.S\./g, 'B<DOT>S<DOT>')
      .replace(/M\.S\./g, 'M<DOT>S<DOT>')
      // Country/location abbreviations
      .replace(/U\.S\./g, 'U<DOT>S<DOT>')
      .replace(/U\.K\./g, 'U<DOT>K<DOT>')
      .replace(/U\.N\./g, 'U<DOT>N<DOT>')
      // Time abbreviations
      .replace(/a\.m\./gi, 'a<DOT>m<DOT>')
      .replace(/p\.m\./gi, 'p<DOT>m<DOT>')
      .replace(/\b(Section|Chapter|Appendix|Part|Figure|Table)\s+(\p{Lu})\.(\s+)(?=\p{Lu}\p{Ll}{2,}\b)/giu, '$1 $2<DOT>$3')
      .replace(/(?:\b\p{Lu}\.)(?:\s*\b\p{Lu}\.)+\s*(?=\p{Lu}\p{Ll}{2,}\b)/gu, (m) => m.replace(/\./g, '<DOT>'))
      .replace(
        /(?<=[\p{Ll}\p{Nd}])(\s+)(\p{Lu}\.)(\s+)(?=\p{Lu}\p{Ll}{2,}\b)/gu,
        (_m, sp1, init, sp2) => `${sp1}${init.slice(0, -1)}<DOT>${sp2}`
      )
      // Polish / Slavic / German-style multi-dot abbrev: "m. in.", "z. B.", "n. p.", "t. j."
      .replace(/\b(\p{Ll})\.(\s+)(\p{Ll}{1,15}\.|\p{Lu}\p{Ll}{0,2}\.)/gu, (_m, a, sp, w) => `${a}<DOT>${sp}${w.slice(0, -1)}<DOT>`)
      // Year + one-letter unit (Polish "2026 r.", Russian "2026 г.", etc.)
      .replace(/\b(\d{4})\s+(\p{L})\./gu, '$1 $2<DOT>');
    // Period not followed by capital: not sentence end (abbr / same sentence; new sentences use capitals)
    processed = processed.replace(/(?<![.!?。])(\.)(\s*)(?=\p{Ll})/gu, '<LOWER_CONT>$2');

    // Split by sentence endings (., !, ?, and Asian punctuation)
    const sentences = this.mergeLowercaseContinuationSentences(
      processed.split(/([.!?。！？]+\s*)/).reduce<string[]>((acc, part, i, arr) => {
        if (i % 2 === 0 && part.trim()) {
          const punctuation = arr[i + 1] || '';
          acc.push((part + punctuation).trim());
        }
        return acc;
      }, [])
    );

    // Restore protected characters
    return this.capLongSentences(
      sentences
        .map((s) =>
          s
            .replace(/<LOWER_CONT>/g, '.')
            .replace(/<DOT>/g, '.')
            .replace(/<DECIMAL>/g, '.')
            .replace(/<DATE_DOT>/g, '.')
        )
        .filter((s) => s.length > 0)
    );
  }

  // 将过长的单句在子句边界处拆分，避免单次 TTS 请求生成超大音频（导致传输/解码失败）
  capLongSentences(sentences: string[], maxLen = 280): string[] {
    const out: string[] = [];
    for (const s of sentences) {
      if (s.length <= maxLen) {
        out.push(s);
        continue;
      }
      // 优先在子句标点（逗号/分号/冒号/顿号）处切分
      const parts = s.split(/(?<=[,;:、，；：])\s*/u);
      const chunks: string[] = [];
      let cur = '';
      for (const p of parts) {
        if (p.length > maxLen) {
          // 子句本身仍超长，按空格硬切
          if (cur) {
            chunks.push(cur);
            cur = '';
          }
          for (let i = 0; i < p.length; i += maxLen) chunks.push(p.slice(i, i + maxLen));
        } else if ((cur + p).length > maxLen) {
          chunks.push(cur);
          cur = p;
        } else {
          cur += p;
        }
      }
      if (cur) chunks.push(cur);
      chunks.forEach((c) => {
        const t = c.trim();
        if (t) out.push(t);
      });
    }
    return out;
  }

  /**
   * 单段落处理管线：连字符换行合并 / 软换行合并 / 换行归一化 + 句子切分 + 长句兜底。
   *
   * 抽成公共方法的目的：让「整页朗读的句子→DOM 映射」（见 content/sentence-map.ts）
   * 与播放器自身切分走**同一段代码**，从结构上保证两份句子表逐句一致，杜绝二次切分漂移。
   */
  splitParagraphToSentences(para: string): string[] {
    let p = (para || '').trim();
    // Join hyphenated line breaks (e.g. "рассказыва-\nлось" → "рассказывалось")
    p = p.replace(/(\w)-\n(\w)/gu, '$1$2');
    // Soft-wrap: next line starts with a lowercase letter → continuation, join with space
    p = p.replace(/\n(\p{Ll})/gu, ' $1');
    // Remaining \n after content not already ending in sentence/clause punctuation → sentence break
    p = p.replace(/([^.!?…:;\n])\n/gu, '$1. ');
    // Any remaining \n (after . ! ? : ; etc.) → space
    p = p.replace(/\n/g, ' ');
    p = p.replace(/ {2,}/g, ' ');
    return this.splitIntoSentences(p);
  }

  setText(text: string): void {
    const paragraphs = (text || '').split(/\n\n+/);
    const allSentences: string[] = [];
    const paragraphBreakAfterIndex = new Set<number>();
    for (let i = 0; i < paragraphs.length; i++) {
      const startLen = allSentences.length;
      allSentences.push(...this.splitParagraphToSentences(paragraphs[i]));
      if (i < paragraphs.length - 1 && allSentences.length > startLen) {
        paragraphBreakAfterIndex.add(allSentences.length - 1);
      }
    }
    this.setSentences(allSentences, paragraphBreakAfterIndex);
  }

  /**
   * 直接灌入规范句子表（跳过切分）。
   *
   * 供整页朗读的「规范路径」使用：句子映射层已用与 setText 相同的管线
   * （splitParagraphToSentences）预先切好句子并建立了「句子→段落单元」映射，
   * 此处直接复用，避免二次切分造成映射漂移。
   */
  setSentences(sentences: string[], paragraphBreakAfterIndex: Set<number>): void {
    this.sentences = sentences;
    this.paragraphBreakAfterIndex = paragraphBreakAfterIndex;
    this.currentIndex = 0;
    this.cleanup();
  }

  getSentenceChunk(startIndex: number, count = 3): string {
    const endIndex = Math.min(startIndex + count, this.sentences.length);
    return this.sentences.slice(startIndex, endIndex).join(' ');
  }

  getCurrentSentence(): string {
    return this.sentences[this.currentIndex] || '';
  }

  hasNext(): boolean {
    return this.currentIndex < this.sentences.length - 1;
  }

  hasPrev(): boolean {
    return this.currentIndex > 0;
  }

  next(): boolean {
    if (this.hasNext()) {
      this.currentIndex++;
      return true;
    }
    return false;
  }

  prev(): boolean {
    if (this.hasPrev()) {
      this.currentIndex--;
      return true;
    }
    return false;
  }

  estimateSentenceDuration(sentence: string, speed: number): number {
    const words = sentence.split(/\s+/).length;
    const baseWPM = 150;
    const minutes = words / baseWPM;
    return (minutes * 60 * 1000) / speed; // milliseconds
  }

  cleanup(): void {
    // Clean up old audio URLs
    this.audioUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        logger.error('Error revoking URL:', e);
      }
    });
    this.audioUrls = [];
  }

  reset(): void {
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.cleanup();
  }

  addAudioUrl(url: string): void {
    this.audioUrls.push(url);
  }
}
