/**
 * 中转运行时：持有 Engine / 音色目录 / 并发队列 / HTTP 服务，提供 start / stop /
 * restart / update / reload / shutdown。
 *
 * 托盘 UI 层只通过本类的接口驱动服务，不直接碰 HTTP 与引擎；配置是运行时的单一
 * 来源（in-memory），update 立即落盘并在监听中时重启服务以生效。
 */
import type { Server } from 'node:http';
import { EdgeEngine } from '../engines/edge';
import { VoiceCatalog } from '../engines/edge/voices';
import { resolveEndpoints } from '../engines/edge/constants';
import { ConcurrencyQueue } from '../queue';
import { createRelayServer } from '../api/http';
import { maskToken } from '../api/auth';
import { loadConfig, writeConfigFile } from '../config/store';
import { normalizeConfig, type RelayConfig } from '../config';
import { logger } from '../log';

export type RuntimeStatus = 'stopped' | 'starting' | 'listening' | 'error';

export interface RuntimeState {
  status: RuntimeStatus;
  config: RelayConfig;
  /** error 状态下的可读原因（供托盘展示） */
  errorMessage?: string;
  /** 已获取的上游音色数量（0 表示尚未获取） */
  voicesCount: number;
}

export type RuntimeListener = (state: RuntimeState) => void;

export class RelayRuntime {
  private server: Server | null = null;
  private engine: EdgeEngine | null = null;
  private voices: VoiceCatalog | null = null;
  private queue: ConcurrencyQueue | null = null;
  private status: RuntimeStatus = 'stopped';
  private errorMessage: string | undefined;
  private voicesCount = 0;
  private listener?: RuntimeListener;
  private config: RelayConfig;

  constructor(config: RelayConfig, listener?: RuntimeListener) {
    this.config = config;
    this.listener = listener;
  }

  getState(): RuntimeState {
    return { status: this.status, config: this.config, errorMessage: this.errorMessage, voicesCount: this.voicesCount };
  }

  getConfig(): RelayConfig {
    return this.config;
  }

  setListener(listener: RuntimeListener): void {
    this.listener = listener;
  }

  /** 启动监听；失败时进入 error 状态（不抛出，错误经状态暴露给托盘） */
  async start(): Promise<void> {
    if (this.status === 'listening' || this.status === 'starting') return;
    this.setStatus('starting');
    try {
      this.buildDeps();
      const server = createRelayServer({
        config: this.config,
        engine: this.engine as EdgeEngine,
        voices: this.voices as VoiceCatalog,
        queue: this.queue as ConcurrencyQueue,
      });
      await this.listen(server);
      this.server = server;
      this.logListening();
      this.setStatus('listening');
      this.prefetchVoices();
    } catch (error) {
      this.server = null;
      this.errorMessage = describeError(error);
      logger.error(`启动失败：${this.errorMessage}`);
      this.setStatus('error');
    }
  }

  /** 停止监听并释放本次构建的引擎依赖 */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) {
      this.setStatus('stopped');
      return;
    }
    this.server = null;
    await closeServer(server);
    logger.info('已停止监听');
    this.setStatus('stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * 应用部分配置改动：归一化 → 落盘 → 监听中则重启生效。
   *
   * 改动作用于内存配置（即使环境变量同名也会被覆盖，托盘所见即所得）；
   * 落盘失败不影响本次会话生效，只记录错误供托盘展示。
   */
  async update(patch: Partial<RelayConfig>): Promise<void> {
    const wasListening = this.status === 'listening';
    this.config = normalizeConfig({ ...this.config, ...patch });
    try {
      writeConfigFile(this.config);
    } catch (error) {
      this.errorMessage = `配置写入失败：${describeError(error)}`;
      logger.warn(`${this.errorMessage}（改动仅对本会话生效）`);
    }
    if (wasListening) {
      await this.restart();
    } else {
      this.notify();
    }
  }

  /** 「重新加载配置」：重读文件（环境变量 > 文件 > 默认），监听中则重启 */
  async reload(): Promise<void> {
    this.config = loadConfig();
    if (this.status === 'listening' || this.status === 'starting') {
      await this.restart();
    } else {
      this.notify();
    }
  }

  /** 优雅关闭：停服务（托盘退出 / 信号 / 托盘进程意外终止时调用） */
  async shutdown(): Promise<void> {
    await this.stop();
  }

  private listen(server: Server): Promise<void> {
    const { host, port } = this.config;
    return new Promise<void>((resolveListen, rejectListen) => {
      const onError = (error: unknown): void => {
        server.removeListener('listening', onListening);
        rejectListen(error);
      };
      const onListening = (): void => {
        server.removeListener('error', onError);
        resolveListen();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  private buildDeps(): void {
    const endpoints = resolveEndpoints(this.config.edgeEndpoint);
    this.engine = new EdgeEngine(
      this.config.edgeEndpoint,
      this.config.trustedClientToken,
      this.config.chromiumVersion,
      this.config.outputFormat,
      this.config.synthTimeoutMs
    );
    this.voices = new VoiceCatalog(endpoints, this.config.trustedClientToken, this.config.voicesTtlMs);
    this.queue = new ConcurrencyQueue(this.config.maxConcurrency, this.config.maxPerClient, this.config.maxQueueSize);
  }

  private logListening(): void {
    const c = this.config;
    logger.info(
      `listening on http://${c.host}:${c.port} ` +
        `endpoint=${c.edgeEndpoint} format=${c.outputFormat} ` +
        `concurrency=${c.maxConcurrency}/${c.maxPerClient} auth=${maskToken(c.relayAuthToken)}`
    );
  }

  private prefetchVoices(): void {
    const voices = this.voices;
    if (!voices) return;
    void voices
      .list()
      .then((list) => {
        this.voicesCount = list.length;
        logger.info(`voices catalog loaded: ${list.length} voices`);
        this.notify();
      })
      .catch((error: unknown) => {
        logger.warn(`voices catalog failed at startup: ${(error as Error).message}`);
      });
  }

  private setStatus(status: RuntimeStatus): void {
    this.status = status;
    if (status !== 'error') this.errorMessage = undefined;
    this.notify();
  }

  private notify(): void {
    this.listener?.(this.getState());
  }
}

/** 关闭服务：等 close 回调，2s 未关闭则强制断开残留 keep-alive 连接 */
function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolveClose) => {
    let settled = false;
    const finish = (): void => {
      if (!settled) {
        settled = true;
        resolveClose();
      }
    };
    server.close(finish);
    setTimeout(() => {
      server.closeAllConnections?.();
      server.close(finish);
    }, 2000).unref();
  });
}

function describeError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'EADDRINUSE') return `地址已被占用（${message}），请更换端口或地址`;
  return message;
}
