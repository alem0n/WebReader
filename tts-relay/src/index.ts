/**
 * tts-relay 入口：加载配置 → 构建 Edge 引擎 / 音色目录 / 并发队列 → 启动 HTTP。
 *
 * 部署形态：无状态 + 可水平扩展（合成是「每段一条短连接」，进程内只需令牌的
 * 窗口级 TTL 缓存，无需长连接池）。多副本 + 负载均衡即分布式。
 */
import { loadConfig } from './config';
import { EdgeEngine } from './engines/edge';
import { VoiceCatalog } from './engines/edge/voices';
import { resolveEndpoints } from './engines/edge/constants';
import { ConcurrencyQueue } from './queue';
import { createRelayServer } from './api/http';

async function main(): Promise<void> {
  const config = loadConfig();
  const endpoints = resolveEndpoints(config.edgeEndpoint);

  const engine = new EdgeEngine(
    config.edgeEndpoint,
    config.trustedClientToken,
    config.chromiumVersion,
    config.outputFormat,
    config.synthTimeoutMs
  );
  const voices = new VoiceCatalog(endpoints, config.trustedClientToken, config.voicesTtlMs);
  const queue = new ConcurrencyQueue(config.maxConcurrency, config.maxPerClient, config.maxQueueSize);

  const server = createRelayServer({ config, engine, voices, queue });

  // 启动时拉一次音色目录（失败不阻塞启动，/v1/health 会暴露诊断）
  void voices
    .list()
    .then((list) => {
      console.log(`[tts-relay] voices catalog loaded: ${list.length} voices`);
    })
    .catch((error: unknown) => {
      console.warn(`[tts-relay] voices catalog failed at startup: ${(error as Error).message}`);
    });

  const shutdown = (signal: string) => {
    console.log(`[tts-relay] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    // 强制兜底：5s 内未关闭则退出
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch((error: unknown) => {
  console.error('[tts-relay] fatal:', error);
  process.exit(1);
});
