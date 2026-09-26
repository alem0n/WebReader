/**
 * 打包形态支持：把 tts-relay 打包成单文件可执行（Node SEA）后，运行时需要的胶水。
 *
 * 为什么需要单独一层：Node SEA 把所有 JS 与静态资源内嵌进可执行文件，运行时没有
 * node_modules 目录，而 systray2 启动时必须能在磁盘上找到它要 spawn 的 Go 二进制。
 * 解决办法（systray2 为此设计了 copyDir 选项）：启动托盘前，把内嵌的托盘二进制
 * 释放到 systray2 约定的缓存目录（~/.cache/node-systray/<systray2 版本>/），
 * 再以 copyDir:true 构造 SysTray——getTrayBinPath 发现目标已存在就直接 spawn，
 * 跳过它自己的拷贝分支，详见 docs/adr/0005。
 *
 * 同一层还负责 SEA 形态下的应用根目录解析：打包后 __dirname 指向 SEA 内部虚拟路径，
 * 不能再用来定位配置 / 日志文件，必须改用可执行文件所在目录。
 *
 * node:sea 的加载做成受保护的懒加载：Node 18 及更早没有这个内置模块，
 * 静态 import 会在加载期直接失败，而 require('node:sea') 失败时视为「未打包」即可。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import systrayPkg from 'systray2/package.json';

type SeaModule = { isSea(): boolean; getRawAsset(key: string): ArrayBuffer };

let seaModule: SeaModule | null | undefined;

/** 懒加载 node:sea；模块不存在（旧 Node）时返回 null，调用方按未打包处理 */
function loadSea(): SeaModule | null {
  if (seaModule !== undefined) return seaModule;
  try {
    seaModule = require('node:sea') as SeaModule;
  } catch {
    seaModule = null;
  }
  return seaModule;
}

/** 托盘二进制在本平台下的文件名（与 systray2 内部 getTrayBinPath 的命名一致） */
export function trayBinName(): string {
  switch (platform()) {
    case 'win32':
      return 'tray_windows_release.exe';
    case 'darwin':
      return 'tray_darwin_release';
    default:
      return 'tray_linux_release';
  }
}

/** 打包成 SEA 后，托盘二进制的释放目标（systray2 的缓存目录） */
export function trayBinCacheDir(): string {
  return join(homedir(), '.cache', 'node-systray', systrayPkg.version);
}

/** 是否以单文件可执行（SEA）形态运行；node 运行时恒为 false */
export function isPackaged(): boolean {
  const sea = loadSea();
  return sea ? sea.isSea() : false;
}

/**
 * 打包形态下释放托盘二进制到 systray2 的缓存目录，使其可被 spawn。
 *
 * 非打包形态直接返回（node 运行时 systray2 自己能从 node_modules 里找到二进制）。
 * 释放失败不抛出——交给上层在托盘起不来时统一回退无头模式（日志保留诊断上下文）。
 * 幂等：目标已存在则跳过，避免每次启动都重写一个 3MB 的可执行文件。
 */
export function extractTrayBinary(): void {
  if (!isPackaged()) return;
  const target = join(trayBinCacheDir(), trayBinName());
  try {
    if (existsSync(target)) return;
    mkdirSync(trayBinCacheDir(), { recursive: true });
    // 构建期以「资源名 = 平台文件名」登记托盘二进制（见 sea-config.json），此处按名取回
    const raw = loadSea()?.getRawAsset(trayBinName());
    if (!raw) {
      console.warn(`[tts-relay] 打包形态缺少托盘二进制资源：${trayBinName()}`);
      return;
    }
    writeFileSync(target, Buffer.from(raw), { mode: 0o755 });
    console.log(`[tts-relay] 已释放托盘二进制：${target}`);
  } catch (error) {
    console.warn(`[tts-relay] 释放托盘二进制失败（${describe(error)}），托盘可能不可用`);
  }
}

/** 打包形态下应用根目录：可执行文件所在目录（配置 / 日志与之同目录） */
export function packagedAppDir(): string {
  return dirname(process.execPath);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
