/**
 * tts-relay 入口：装填配置 → 按运行形态启动。
 *
 * 两种形态：
 * - 托盘模式（默认）：先把自己后台化（脱离启动它的终端），再驻留为系统托盘图标，
 *   右键菜单可查看监听地址、开关监听、改监听地址 / 端口 / Edge 端点；改动持久化到
 *   可执行文件同目录的 config.json（路径解析与优先级见 config/store.ts 与 README）。
 * - 无头模式（`--headless` / `--no-tray` / `HEADLESS=1`）：沿用环境变量配置，
 *   供服务器 / 容器部署，保持前台运行交由进程管理器托管，行为与改造前一致。
 *
 * 托盘不可用（无桌面、二进制缺失）时自动回退无头模式，保证服务始终可用。
 */
import { loadConfig } from './config/store';
import { RelayRuntime } from './runtime/relay-runtime';
import { backgroundLaunchMessage, launchBackground, needsBackgroundLaunch, type RunMode } from './runtime/detach';
import { resolveLogFilePath } from './config/store';
import { RelayTray } from './tray/relay-tray';
import type { RelayConfig } from './config';

// tts-relay 版本（关于菜单展示）。用 require 直接取根 package.json，
// 避开 tsc rootDir=src 对 import json 的限制
const { version } = require('../../package.json') as { version: string };

function resolveMode(): RunMode {
  if (process.argv.slice(2).some((arg) => arg === '--headless' || arg === '--no-tray')) return 'headless';
  const env = (process.env.HEADLESS ?? '').trim().toLowerCase();
  if (env === '1' || env === 'true' || env === 'yes') return 'headless';
  return 'tray';
}

async function main(): Promise<void> {
  const mode = resolveMode();

  // 托盘模式且挂在真实终端上：转入后台，让关掉终端不影响运行（详见 runtime/detach.ts）
  if (needsBackgroundLaunch(mode)) {
    const pid = await launchBackground();
    if (pid >= 0) {
      console.log(backgroundLaunchMessage(resolveLogFilePath(), pid));
      process.exit(0);
    }
    console.warn('[tts-relay] 后台化失败，以前台模式继续运行');
  }

  const config = loadConfig();
  if (mode === 'headless') {
    await runHeadless(config);
    return;
  }
  try {
    await runTray(config);
  } catch (error) {
    console.warn(`[tts-relay] 托盘模式不可用（${describe(error)}），回退到无头服务模式`);
    await runHeadless(config);
  }
}

async function runTray(config: RelayConfig): Promise<void> {
  const runtime = new RelayRuntime(config);
  const tray = new RelayTray({ runtime, version });
  runtime.setListener(() => tray.refresh());
  // 先把托盘立起来（失败则上层回退无头），再启动监听，菜单可实时反映启动过程
  await tray.start();
  await runtime.start();
  installShutdownHandlers(runtime, tray);
}

async function runHeadless(config: RelayConfig): Promise<void> {
  const runtime = new RelayRuntime(config);
  await runtime.start();
  if (runtime.getState().status !== 'listening') {
    console.error('[tts-relay] 监听失败，退出（错误见上方日志）');
    process.exit(1);
  }
  installShutdownHandlers(runtime);
}

function installShutdownHandlers(runtime: RelayRuntime, tray?: RelayTray): void {
  const handler = (signal: string): void => {
    console.log(`[tts-relay] ${signal} received, shutting down`);
    void (async () => {
      try {
        if (tray) await tray.shutdown();
        else await runtime.shutdown();
      } catch (error) {
        console.warn(`[tts-relay] 关闭失败：${describe(error)}`);
      }
      process.exit(0);
    })();
    // 强制兜底：5s 内未关闭则退出
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main().catch((error: unknown) => {
  console.error('[tts-relay] fatal:', error);
  process.exit(1);
});
