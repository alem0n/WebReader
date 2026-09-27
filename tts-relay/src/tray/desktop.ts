/**
 * 桌面小操作的跨平台封装：打开 URL、复制到剪贴板、用默认编辑器打开文件。
 *
 * 托盘是驻留型桌面程序，这些能力都是「尽力而为」——失败时只记日志，
 * 不打断主流程（地址在菜单状态行里本来就能看到）。
 */
import { spawn } from 'node:child_process';
import { platform } from 'node:os';

type Platform = 'win32' | 'darwin' | 'linux';

function currentPlatform(): Platform {
  return platform() as Platform;
}

/** 用系统默认程序打开 URL */
export function openUrl(url: string): void {
  const plat = currentPlatform();
  const command = plat === 'win32' ? 'cmd' : plat === 'darwin' ? 'open' : 'xdg-open';
  const args = plat === 'win32' ? ['/c', 'start', '', url] : [url];
  run(command, args, `打开 ${url}`);
}

/** 复制文本到系统剪贴板（无对应工具时静默失败） */
export function copyText(text: string): void {
  const plat = currentPlatform();
  const command = plat === 'win32' ? 'clip' : plat === 'darwin' ? 'pbcopy' : 'xclip';
  const args = plat === 'linux' ? ['-selection', 'clipboard'] : [];
  try {
    const child = spawn(command, args, { windowsHide: true });
    child.stdin?.on('error', () => {
      // 剪贴板工具缺失时 EPIPE，忽略即可（地址在菜单里本就能看到）
    });
    child.stdin?.end(text);
    child.on('error', (error) => console.warn(`[tts-relay] 复制到剪贴板失败：${error.message}`));
  } catch (error) {
    console.warn(`[tts-relay] 复制到剪贴板失败：${describe(error)}`);
  }
}

function run(command: string, args: string[], describeAction: string): void {
  try {
    const child = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
    child.on('error', (error) => console.warn(`[tts-relay] ${describeAction} 失败：${error.message}`));
    child.unref();
  } catch (error) {
    console.warn(`[tts-relay] ${describeAction} 失败：${describe(error)}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
