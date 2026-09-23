/** 跨层共享的小工具（纯函数，不依赖任何层 state，不含任何 Node 专属 API） */
import { stripParentheticals } from './parentheticals';

/**
 * 朗读前文本统一预处理。
 * @param enabled 是否开启"删除括号内容"，由各层从自身 state 传入
 */
export function applyParentheticalFilter(text: string, enabled: boolean): string {
  return enabled ? stripParentheticals(text) : text;
}

/** 可等待的延时（毫秒） */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 浮点版钳制（保留小数，如语速 1.25） */
export function limitFloat(num: unknown, min = 0.0, max = 100.0): number {
  const n = parseFloat(String(num ?? ''));
  if (Number.isNaN(n) || n < min) return min;
  if (n > max) return max;
  return n;
}

/** 防抖包装，附带手动取消未执行任务的方法 */
type Debounced<F extends (...args: any[]) => void> = F & { cancel: () => void };

export function debounce<F extends (...args: any[]) => void>(func: F, delay = 200): Debounced<F> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      func(...args);
    }, delay);
  };

  (debounced as Debounced<F>).cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return debounced as Debounced<F>;
}

/**
 * 为异步任务设置超时边界。
 *
 * task 既可以是 Promise 也可以是返回 Promise 的函数（函数形式会在调用时才执行），
 * 与 background 既有的 AbortController 协作时由调用方自行把 signal 传进 task。
 */
export function withTimeout<T>(task: Promise<T> | (() => Promise<T>), timeout: number, timeoutMsg = 'Task timed out'): Promise<T> {
  const promise = typeof task === 'function' ? task() : task;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMsg)), timeout);
    }),
  ]);
}

/**
 * 浏览器空闲调度执行器，不支持 requestIdleCallback（如 MV3 Service Worker）时退化为 setTimeout。
 * @returns 调度句柄（可直接传给 cancelIdleCallback / clearTimeout）
 */
export function scheduleIdle(cb: () => void, timeout = 200): number {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(cb, { timeout });
  }
  return setTimeout(cb, timeout) as unknown as number;
}
