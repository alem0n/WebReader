/** AudioCacheManager:生产者-消费者模式的音频缓存队列
 * 后台持续维持 maxPrefetch 个句子的音频缓存，播放时直接从队列取出
 */
import type { PresetVoice, TtsProvider } from './types';
import { synthesizeWithRetry } from './tts-pool';
import { createLogger } from './log';

const logger = createLogger('WebReader/audio-cache');

export class AudioCacheManager {
  cache: Map<string, Blob> = new Map(); // cacheKey → Blob（已合成的音频）
  inFlight: Map<string, Promise<Blob>> = new Map(); // cacheKey → Promise<Blob>（正在合成中）
  maxPrefetch: number;
  isRunning = false;
  currentIndex = 0; // 当前播放位置
  sentences: string[] = []; // 全部句子数组
  voice: string | PresetVoice | null = null;
  speed = 1.0;
  /** 当前 provider：纳入缓存键，避免 MiMo 与 relay 同名音色错命中（plan.md P2） */
  provider: TtsProvider = 'mimo';
  _producerTimer: ReturnType<typeof setTimeout> | null = null;
  _wakeResolve: (() => void) | null = null;

  constructor(maxPrefetch = 5) {
    this.maxPrefetch = maxPrefetch;
  }

  _cacheKey(index: number): string {
    return this.voice ? `${index}-${this.provider}-${this.voice}-${this.speed}` : `idx-${index}`;
  }

  has(index: number): boolean {
    return this.cache.has(this._cacheKey(index));
  }

  get(index: number): Blob | undefined {
    return this.cache.get(this._cacheKey(index));
  }

  /**
   * 消费者接口：确保 sentenceIndex 的音频可用。
   * 如果已缓存立即返回；如果正在合成则等待；否则立即合成。
   * cancelCheckFn: 可选的取消检查回调，返回 true 表示已取消。
   */
  async ensure(sentenceIndex: number, cancelCheckFn?: () => boolean): Promise<Blob | null> {
    const key = this._cacheKey(sentenceIndex);

    if (this.cache.has(key)) return this.cache.get(key) as Blob;

    if (this.inFlight.has(key)) {
      try {
        const blob = (await this.inFlight.get(key)) as Blob;
        return cancelCheckFn && cancelCheckFn() ? null : blob;
      } catch {
        return null;
      }
    }

    return this._doSynth(sentenceIndex, key, cancelCheckFn);
  }

  async _doSynth(index: number, key: string, cancelCheckFn?: () => boolean): Promise<Blob | null> {
    // 双重检查：另一个调用方可能已开始此合成
    if (this.inFlight.has(key)) {
      try {
        const blob = (await this.inFlight.get(key)) as Blob;
        return cancelCheckFn && cancelCheckFn() ? null : blob;
      } catch {
        return null;
      }
    }

    const text = this.sentences[index];
    if (!text) return null;
    const trimmed = (text || '').trim();
    if (trimmed.length === 0 || !/[\p{L}\d]/u.test(trimmed)) return null;

    const promise = synthesizeWithRetry(text, this.voice as string | PresetVoice, this.speed, this.provider);
    this.inFlight.set(key, promise);

    try {
      const blob = await promise;
      if (cancelCheckFn && cancelCheckFn()) return null;
      this.cache.set(key, blob);
      return blob;
    } catch (e) {
      if (cancelCheckFn && cancelCheckFn()) return null;
      throw e;
    } finally {
      this.inFlight.delete(key);
      if (this._wakeResolve) {
        this._wakeResolve();
        this._wakeResolve = null;
      }
    }
  }

  /** 启动后台生产者，从 fromIndex 开始维持 maxPrefetch 个缓存 */
  start(sentences: string[], voice: string | PresetVoice, speed: number, fromIndex?: number, provider: TtsProvider = 'mimo'): void {
    this.stop();
    this.sentences = sentences;
    this.voice = voice;
    this.speed = speed;
    this.provider = provider;
    this.currentIndex = fromIndex || 0;
    this.isRunning = true;
    this._producerLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this._producerTimer) {
      clearTimeout(this._producerTimer);
      this._producerTimer = null;
    }
    if (this._wakeResolve) {
      this._wakeResolve();
      this._wakeResolve = null;
    }
  }

  clear(): void {
    this.stop();
    this.cache.clear();
    this.inFlight.clear();
  }

  setCurrentIndex(index: number): void {
    this.currentIndex = index;
    if (this._wakeResolve) {
      this._wakeResolve();
      this._wakeResolve = null;
    }
  }

  /** 生产者主循环：持续检测并补充缓存至 maxPrefetch 个 */
  async _producerLoop(): Promise<void> {
    while (this.isRunning) {
      let synthesized = 0;

      for (let i = this.currentIndex, slots = 0; slots < this.maxPrefetch && i < this.sentences.length && this.isRunning; i++) {
        const trimmed = (this.sentences[i] || '').trim();
        const speakable = trimmed.length > 0 && /[\p{L}\d]/u.test(trimmed);
        if (!speakable) {
          slots++;
          continue;
        }

        const key = this._cacheKey(i);
        if (this.cache.has(key) || this.inFlight.has(key)) {
          slots++;
          continue;
        }

        try {
          await this._doSynth(i, key);
          synthesized++;
        } catch (e) {
          logger.warn(`Prefetch sentence ${i} failed:`, (e as Error).message);
        }
        slots++;
      }

      // 本轮无需合成（全部已缓存），等待后重新检测
      if (synthesized === 0 && this.isRunning) {
        await new Promise<void>((r) => {
          this._wakeResolve = r;
          this._producerTimer = setTimeout(r, 500);
        });
        this._producerTimer = null;
        this._wakeResolve = null;
      }
    }
  }
}
