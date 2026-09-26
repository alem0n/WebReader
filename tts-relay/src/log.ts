/**
 * 文件日志：把带时间戳的诊断行追加到日志文件（路径见 config/store.ts 的 resolveLogFilePath）。
 *
 * 为什么需要独立日志层：托盘模式后台运行时没有控制台，出问题时必须能从磁盘看到完整经过。
 *
 * 两个约束：
 * - 只在非后台化时同时输出到控制台。RELAY_DETACHED=1 时 stdout 已被重定向到同一文件，
 *   再写 console 会得到重复行。
 * - 尽力而为：任何写入失败都吞掉，日志本身绝不能让进程崩溃。
 */
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { resolveLogFilePath } from './config/store';

const MAX_BYTES = 2 * 1024 * 1024;
let rotated = false;

/** 超过 2MB 时滚动一次到 <file>.old（后台化时 detach.ts 已先滚过一次，这里不会重复） */
function rotateOnce(): void {
  if (rotated) return;
  rotated = true;
  try {
    const filePath = resolveLogFilePath();
    if (existsSync(filePath) && statSync(filePath).size > MAX_BYTES) {
      renameSync(filePath, `${filePath}.old`);
    }
  } catch {
    // 滚动失败不影响后续追加
  }
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/** 追加一条日志；level 决定控制台走 error / warn / log */
export function log(level: LogLevel, message: string): void {
  rotateOnce();
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  try {
    appendFileSync(resolveLogFilePath(), `${line}\n`);
  } catch {
    // 写入失败（只读目录 / 磁盘满）不抛出，日志不能反过来拖垮服务
  }
  if (process.env.RELAY_DETACHED !== '1') {
    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN') console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  info: (message: string): void => log('INFO', message),
  warn: (message: string): void => log('WARN', message),
  error: (message: string): void => log('ERROR', message),
};
