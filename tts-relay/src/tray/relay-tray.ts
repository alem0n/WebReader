/**
 * 托盘 UI 层：创建系统托盘 → 把菜单点击派发为运行时操作 / 桌面操作 → 状态变化时刷新菜单。
 *
 * 依赖 systray2（预编译 Go 二进制，经 stdin/stdout 通信，无需本机编译）。
 * 采用动态 import，无头模式与单元测试路径完全不加载本模块的依赖。
 *
 * 隐性契约：菜单对象一经创建即被 systray2 按内部 __id 回指，刷新只能就地改字段
 * （见 menu.applyState），不能整体替换 items，否则点击回指会失联。
 */
import type SysTray from 'systray2';
import type { ClickEvent, Menu } from 'systray2';
import type { RelayRuntime } from '../runtime/relay-runtime';
import { ensureConfigFile, resolveConfigFilePath } from '../config/store';
import { applyState, COMMAND, createMenu, listenUrl, type CommandMenuItem } from './menu';
import { copyText, openFile, openUrl } from './desktop';

export interface TrayDeps {
  runtime: RelayRuntime;
  /** tts-relay 版本（关于菜单展示） */
  version: string;
}

const PORT_PREFIX = 'port:';
const ENDPOINT_PREFIX = 'endpoint:';

export class RelayTray {
  private tray: SysTray | null = null;
  private menu: Menu | null = null;
  private exiting = false;
  private readonly configFilePath = resolveConfigFilePath();

  constructor(private readonly deps: TrayDeps) {}

  /** 创建托盘并注册回调；托盘二进制不可用时抛出，由上层回退到无头模式 */
  async start(): Promise<void> {
    const SysTrayClass = (await import('systray2')).default;
    const menu = createMenu(this.deps.runtime.getState(), {
      version: this.deps.version,
      configFilePath: this.configFilePath,
    });
    this.menu = menu;

    const tray = new SysTrayClass({ menu, debug: false, copyDir: false });
    this.tray = tray;
    await tray.ready();
    tray.onError((error: Error) => console.warn(`[tts-relay] 托盘错误：${error.message}`));
    tray.onExit(() => {
      void this.onTrayExited();
    });
    tray.onClick((action: ClickEvent) => {
      void this.dispatch(action);
    });
    console.log('[tts-relay] 托盘已就绪（右键图标查看监听地址 / 开关监听 / 改配置）');
  }

  /** 状态变化后整体刷新菜单（标题 / 勾选 / 可用性） */
  refresh(): void {
    if (!this.tray || !this.menu) return;
    applyState(this.menu, this.deps.runtime.getState());
    void this.tray.sendAction({ type: 'update-menu', menu: this.menu });
  }

  private async dispatch(action: ClickEvent): Promise<void> {
    const id = (action.item as CommandMenuItem).id;
    if (!id) return;
    const { runtime } = this.deps;

    switch (id) {
      case COMMAND.toggleListen:
        if (runtime.getState().status === 'listening') {
          await runtime.stop();
        } else {
          await runtime.start();
        }
        return;
      case COMMAND.hostLocal:
        await runtime.update({ host: '127.0.0.1' });
        return;
      case COMMAND.hostLan:
        await runtime.update({ host: '0.0.0.0' });
        return;
      case COMMAND.openBrowser:
        openUrl(listenUrl(runtime.getConfig()));
        return;
      case COMMAND.copyAddress:
        copyText(listenUrl(runtime.getConfig()));
        return;
      case COMMAND.openConfigFile:
        ensureConfigFile(runtime.getConfig());
        openFile(this.configFilePath);
        return;
      case COMMAND.reloadConfig:
        await runtime.reload();
        return;
      case COMMAND.exit:
        await this.exit();
        return;
      default:
        // 端口快捷项与端点切换项
        if (id.startsWith(PORT_PREFIX)) {
          const port = Number(id.slice(PORT_PREFIX.length));
          if (Number.isInteger(port) && port > 0) await runtime.update({ port });
        } else if (id.startsWith(ENDPOINT_PREFIX)) {
          const endpoint = id.slice(ENDPOINT_PREFIX.length);
          await runtime.update({ edgeEndpoint: endpoint === 'msedgeservices' ? 'msedgeservices' : 'bing' });
        }
    }
  }

  private async exit(): Promise<void> {
    console.log('[tts-relay] 用户从托盘退出');
    await this.shutdown();
    process.exit(0);
  }

  /** 托盘二进制被外部杀死（如任务管理器）时：服务不应成为无 UI 的孤儿，一并关闭 */
  private async onTrayExited(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    console.warn('[tts-relay] 托盘进程意外退出，中转服务随之关闭');
    try {
      await this.deps.runtime.shutdown();
    } catch (error) {
      console.warn(`[tts-relay] 关闭服务失败：${describe(error)}`);
    }
    process.exit(0);
  }

  /** 优雅关闭：先停服务，再退托盘 */
  async shutdown(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    try {
      await this.deps.runtime.shutdown();
    } catch (error) {
      console.warn(`[tts-relay] 关闭服务失败：${describe(error)}`);
    }
    const tray = this.tray;
    if (tray && !tray.killed) {
      try {
        await tray.kill(false);
      } catch (error) {
        console.warn(`[tts-relay] 关闭托盘失败：${describe(error)}`);
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
