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
import { ensureConfigFile, resolveConfigFilePath, resolveLogFilePath } from '../config/store';
import {
  applyState,
  COMMAND,
  createMenu,
  itemsToUpdate,
  listenUrl,
  signatureOf,
  snapshotOf,
  type CommandMenuItem,
} from './menu';
import { copyText, openFile, openUrl } from './desktop';
import { ensureLogFile, logger } from '../log';

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
  /** 菜单项指纹快照（键是 systray2 分配的 __id），只对变化的项发 update-item */
  private itemSnapshot = new Map<number, string>();
  private tooltipSnapshot = '';
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
    // 菜单已被库按初始状态渲染，建立指纹基线，之后 refresh 只发变化的项
    this.itemSnapshot = snapshotOf(menu);
    this.tooltipSnapshot = menu.tooltip;
    tray.onError((error: Error) => logger.warn(`托盘错误：${error.message}`));
    tray.onExit(() => {
      void this.onTrayExited();
    });
    tray.onClick((action: ClickEvent) => {
      void this.dispatch(action);
    });
    logger.info(`托盘已就绪（右键图标查看监听地址 / 开关监听 / 改配置）`);
    logger.info(`配置文件：${this.configFilePath} | 日志文件：${resolveLogFilePath()}`);
  }

  /**
   * 状态变化后刷新菜单（标题 / 勾选 / 可用性）。
   *
   * 顶层（tooltip）变化发 update-menu；菜单项变化必须逐个发 update-item——
   * update-menu 不会重绘菜单项，只发它会让菜单停在创建时的状态，
   * 表现为「点击开关监听毫无反应」（服务已变化但菜单不刷新）。
   */
  refresh(): void {
    if (!this.tray || !this.menu) return;
    applyState(this.menu, this.deps.runtime.getState());
    for (const it of itemsToUpdate(this.menu, this.itemSnapshot)) {
      const key = it.__id as number;
      this.itemSnapshot.set(key, signatureOf(it));
      void this.tray.sendAction({ type: 'update-item', item: it }).catch((error: unknown) => {
        logger.warn(`托盘菜单项更新失败（${it.title}）：${describe(error)}`);
      });
    }
    if (this.menu.tooltip !== this.tooltipSnapshot) {
      this.tooltipSnapshot = this.menu.tooltip;
      void this.tray.sendAction({ type: 'update-menu', menu: this.menu }).catch((error: unknown) => {
        logger.warn(`托盘顶层菜单更新失败：${describe(error)}`);
      });
    }
  }

  private async dispatch(action: ClickEvent): Promise<void> {
    const id = (action.item as CommandMenuItem).id;
    if (!id) return;
    logger.info(`托盘点击：${id}`);
    try {
      await this.handleCommand(id);
    } catch (error) {
      logger.error(`托盘命令失败（${id}）：${describe(error)}`);
    }
  }

  private async handleCommand(id: string): Promise<void> {
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
      case COMMAND.openLogFile:
        ensureLogFile();
        openFile(resolveLogFilePath());
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
    logger.info('用户从托盘退出');
    await this.shutdown();
    process.exit(0);
  }

  /** 托盘二进制被外部杀死（如任务管理器）时：服务不应成为无 UI 的孤儿，一并关闭 */
  private async onTrayExited(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    logger.warn('托盘进程意外退出，中转服务随之关闭');
    try {
      await this.deps.runtime.shutdown();
    } catch (error) {
      logger.warn(`关闭服务失败：${describe(error)}`);
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
      logger.warn(`关闭服务失败：${describe(error)}`);
    }
    const tray = this.tray;
    if (tray && !tray.killed) {
      try {
        await tray.kill(false);
      } catch (error) {
        logger.warn(`关闭托盘失败：${describe(error)}`);
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
