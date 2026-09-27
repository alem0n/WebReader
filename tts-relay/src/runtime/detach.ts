/**
 * 托盘模式的后台化：进程挂在真实终端上时，重新拉起一个脱离控制台的自己，父进程随即退出。
 *
 * 解决「npm start 后关闭终端把服务一起带走」的问题——托盘驻留的意义就是不开终端运行：
 * - POSIX：detached 子进程进入新会话（setsid），脱离控制终端，终端关闭的 SIGHUP 不波及；
 * - Windows：detached 子进程位于新进程组，控制台关闭下发的 CTRL_CLOSE_EVENT 不会带走它
 *   （已实机验证：同一控制台的父进程被 CTRL_CLOSE 杀死，detached 子进程继续运行）。
 *
 * 子进程的标准输出重定向到应用目录的日志文件（GUI 程序没有控制台可看输出）。
 * 用 RELAY_DETACHED 环境变量标记子进程避免重复拉起；--foreground 可显式保持前台（调试用）。
 */
import { spawn } from 'node:child_process';
import { openSync, renameSync, statSync } from 'node:fs';
import { resolveLogFilePath } from '../config/store';

const DETACHED_ENV = 'RELAY_DETACHED';
const FOREGROUND_FLAG = '--foreground';
/** 确认子进程已起来的观察窗口（过短可能误判，过长拖慢启动） */
const CONFIRM_TIMEOUT_MS = 400;
/** 单个日志文件超过此大小则轮转（控制台输出量小，仅在启动时检查一次） */
const LOG_ROTATE_BYTES = 2 * 1024 * 1024;

export type RunMode = 'tray' | 'headless';

/**
 * 是否需要后台化：仅托盘模式、挂在真实终端（stdout 是 TTY）、且未显式要求前台时。
 *
 * 输出已被重定向（管道 / 文件 / 无控制台）时不处理——那已是「后台」形态，
 * 贸然再拉一层反而会破坏管道用法与进程管理器。
 */
export function needsBackgroundLaunch(mode: RunMode): boolean {
  if (mode !== 'tray') return false;
  if (process.env[DETACHED_ENV] === '1') return false;
  if (process.argv.slice(2).includes(FOREGROUND_FLAG)) return false;
  return process.stdout.isTTY === true;
}

/**
 * 拉起脱离控制台的子进程。成功返回子进程 PID；失败返回 -1（调用方保持前台运行）。
 */
export async function launchBackground(): Promise<number> {
  const logPath = resolveLogFilePath();
  rotateLogIfNeeded(logPath);
  let fd: number;
  try {
    fd = openSync(logPath, 'a');
  } catch (error) {
    console.warn(`[tts-relay] 打开日志文件失败（${describe(error)}），保持前台运行`);
    return -1;
  }

  let failed = false;
  let child;
  try {
    child = spawn(process.execPath, process.argv.slice(1), {
      detached: true,
      stdio: ['ignore', fd, fd],
      cwd: process.cwd(),
      env: { ...process.env, [DETACHED_ENV]: '1' },
      windowsHide: true,
    });
    child.on('error', (error) => {
      failed = true;
      console.warn(`[tts-relay] 后台进程启动失败：${describe(error)}`);
    });
  } catch (error) {
    console.warn(`[tts-relay] 后台进程启动失败：${describe(error)}`);
    return -1;
  }

  // 给系统一点时间确认子进程真的起来（spawn 的部分错误是异步抛出的）
  await new Promise((resolveWait) => setTimeout(resolveWait, CONFIRM_TIMEOUT_MS));
  if (failed || child.exitCode !== null || child.killed) {
    try {
      child.kill();
    } catch {
      // 忽略：进程可能已退出
    }
    return -1;
  }
  return child.pid ?? -1;
}

/** 后台化成功时给用户的告别提示（终端里最后一段可见输出） */
export function backgroundLaunchMessage(logPath: string, pid: number): string {
  return [
    '[tts-relay] 已转入后台运行（托盘驻留）：关闭此终端不会退出程序。',
    `[tts-relay] 退出请用托盘右键菜单「退出」；运行日志：${logPath}（PID ${pid}）`,
  ].join('\n');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 日志过大时轮转一份（追加模式只在每次启动时检查，控制台输出量小足够用） */
function rotateLogIfNeeded(logPath: string): void {
  try {
    if (statSync(logPath).size > LOG_ROTATE_BYTES) renameSync(logPath, `${logPath}.old`);
  } catch {
    // 文件不存在或不可访问：忽略，照常追加
  }
}
