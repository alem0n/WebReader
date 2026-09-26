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
import { resolveConfigFilePath, resolveLogFilePath } from './config/store';
import { RelayTray } from './tray/relay-tray';
import { logger } from './log';
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
  logger.info(`tts-relay ${version} 启动（模式：${mode === 'tray' ? '托盘驻留' : '无头服务'}）`);
  logger.info(`配置文件：${resolveConfigFilePath()} | 日志文件：${resolveLogFilePath()}`);

  // 托盘模式且挂在真实终端上：转入后台，让关掉终端不影响运行（详见 runtime/detach.ts）
  if (needsBackgroundLaunch(mode)) {
    const pid = await launchBackground();
    if (pid >= 0) {
      console.log(backgroundLaunchMessage(resolveLogFilePath(), pid));
      process.exit(0);
    }
    logger.warn('后台化失败，以前台模式继续运行');
  }

  const config = loadConfig();
  if (mode === 'headless') {
    await runHeadless(config);
    return;
  }
  try {
    await runTray(config);
  } catch (error) {
    logger.warn(`托盘模式不可用（${describe(error)}），回退到无头服务模式`);
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
    logger.error('监听失败，退出（错误见日志文件）');
    process.exit(1);
  }
  installShutdownHandlers(runtime);
}

function installShutdownHandlers(runtime: RelayRuntime, tray?: RelayTray): void {
  const handler = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);
    void (async () => {
      try {
        if (tray) await tray.shutdown();
        else await runtime.shutdown();
      } catch (error) {
        logger.warn(`关闭失败：${describe(error)}`);
      }
      process.exit(0);
    })();
    // 强制兜底：5s 内未关闭则退出
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
}

/**
 * 兜底诊断：把未捕获异常与未处理的拒绝写进日志文件，否则后台运行时无处可查。
 * unhandledRejection 只记录不退出（多为点击回调里可恢复的错误）。
 */
function installCrashDiagnostics(): void {
  process.on('uncaughtException', (error: unknown) => {
    logger.error(`未捕获异常：${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    logger.warn(`未处理的 Promise 拒绝：${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

installCrashDiagnostics();

void main().catch((error: unknown) => {
  logger.error(`fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
