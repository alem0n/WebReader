/** web-audio-player (migrated from content.js) */
import { createContentLogger } from './log';

const logger = createContentLogger('web-audio-player');

export class WebAudioPlayer {
  private _ctx: AudioContext | null;
  private _buffer: AudioBuffer | null;
  private _source: AudioBufferSourceNode | null;
  private _gain: GainNode | null;
  private _srcUrl: string;
  private _startTime: number;
  private _offset: number;
  private _playing: boolean;
  private _paused: boolean;
  private _ended: boolean;
  private _error: any;
  private _listeners: Record<string, Array<(event: any) => void>>;
  private _timerId: ReturnType<typeof setTimeout> | null;
  private _readyPromise: Promise<void> | null;
  private _manualStop: boolean;
  onended: ((event: any) => void) | null;

  constructor() {
    this._ctx = null;
    this._buffer = null; // AudioBuffer
    this._source = null; // AudioBufferSourceNode
    this._gain = null; // GainNode
    this._srcUrl = '';
    this._startTime = 0; // 播放开始时的 ctx 时间
    this._offset = 0; // 暂停时的播放位置（秒）
    this._playing = false;
    this._paused = true;
    this._ended = false;
    this._error = null;
    this._listeners = {};
    this._timerId = null;
    this._readyPromise = null;
    this._manualStop = false;
    this.onended = null;
  }

  // ---- 事件系统（兼容 addEventListener / removeEventListener）----
  addEventListener(type: any, cb: any) {
    (this._listeners[type] = this._listeners[type] || []).push(cb);
  }
  removeEventListener(type: any, cb: any) {
    const arr = this._listeners[type] || [];
    const i = arr.indexOf(cb);
    if (i > -1) arr.splice(i, 1);
  }
  _emit(type: any, event?: any) {
    (this._listeners[type] || []).forEach((cb) => {
      try {
        cb.call(this, event);
      } catch (e) {
        logger.error('listener error:', e);
      }
    });
    if (type === 'ended' && typeof this.onended === 'function') {
      try {
        this.onended.call(this, event);
      } catch (e) {
        logger.error('onended error:', e);
      }
    }
  }

  // ---- 属性 ----
  get src() {
    return this._srcUrl;
  }
  get paused() {
    return this._paused;
  }
  get ended() {
    return this._ended;
  }
  get duration() {
    return this._buffer ? this._buffer.duration : NaN;
  }
  get error() {
    return this._error;
  }
  get currentTime() {
    if (!this._ctx || !this._buffer) return 0;
    if (this._paused) return this._offset;
    const t = this._offset + (this._ctx!.currentTime - this._startTime);
    return Math.min(Math.max(t, 0), this._buffer.duration);
  }
  set currentTime(t) {
    this._offset = Math.max(0, t || 0);
  }

  async _ensureCtx() {
    if (!this._ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this._ctx = new Ctor();
    }
    if (this._ctx!.state === 'suspended') {
      try {
        await this._ctx!.resume();
      } catch (e) {
        /* 用户手势后重试即可 */
      }
    }
  }

  // ---- 加载/解码（fetch blob + decodeAudioData，绕过 CSP）----
  set src(url) {
    this._stopSource(true);
    this._srcUrl = url;
    this._buffer = null;
    this._offset = 0;
    this._paused = true;
    this._ended = false;
    this._error = null;
    this._readyPromise = !url ? Promise.resolve() : this._decode(url);
  }

  async _decode(url: string) {
    try {
      await this._ensureCtx();
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const arrayBuffer = await resp.arrayBuffer();
      this._buffer = await this._ctx!.decodeAudioData(arrayBuffer);
    } catch (e) {
      this._error = { code: 4, message: (e as any)?.message || 'decode failed' };
      logger.error('load/decode failed:', this._error.message);
      this._emit('error', { message: this._error.message });
    }
  }

  // ---- 播放控制 ----
  async play() {
    if (this._playing) return;
    if (this._readyPromise) await this._readyPromise;
    if (!this._buffer) {
      // 与 <audio> 加载失败时的行为一致，上层 catch 会处理
      const err = new Error('Failed to load because no supported source was found.');
      err.name = 'NotSupportedError';
      throw err;
    }
    await this._ensureCtx();
    this._manualStop = false;
    this._source = this._ctx!.createBufferSource();
    this._source.buffer = this._buffer;
    this._gain = this._ctx!.createGain();
    this._source.connect(this._gain);
    this._gain.connect(this._ctx!.destination);
    this._source.onended = () => this._onSourceEnded();
    const offset = Math.min(this._offset, this._buffer.duration);
    this._startTime = this._ctx!.currentTime;
    this._source.start(0, offset);
    this._playing = true;
    this._paused = false;
    this._ended = false;
    this._emit('play');
    this._startTimer();
  }

  pause() {
    if (!this._playing) return;
    this._offset = this.currentTime;
    this._stopSource(true);
    this._paused = true;
    this._emit('pause');
  }

  _stopSource(manual: any) {
    this._stopTimer();
    this._manualStop = !!manual;
    if (this._source) {
      try {
        this._source.onended = null;
        this._source.stop();
      } catch (e) {
        /* 已停止 */
      }
      try {
        this._source.disconnect();
      } catch (e) {}
      this._source = null;
    }
    if (this._gain) {
      try {
        this._gain.disconnect();
      } catch (e) {}
      this._gain = null;
    }
    this._playing = false;
  }

  _onSourceEnded() {
    if (this._manualStop) return; // 手动暂停/换源触发，不算自然结束
    this._playing = false;
    this._paused = true;
    this._ended = true;
    this._offset = 0;
    this._stopTimer();
    this._emit('ended');
  }

  // ---- timeupdate（定时器模拟）----
  _startTimer() {
    this._stopTimer();
    this._timerId = setInterval(() => {
      if (this._playing) this._emit('timeupdate');
    }, 100);
  }
  _stopTimer() {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  // ---- 清理（兼容 <audio> 接口）----
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  load() {
    /* Web Audio 无需此操作，保持接口兼容 */
  }
}
