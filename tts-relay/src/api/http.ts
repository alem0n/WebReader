/**
 * HTTP API：POST /v1/tts · GET /v1/voices · GET /v1/health。
 *
 * 设计：无状态 + 可水平扩展（合成是「每段一条短连接」，进程内只需令牌的
 * 窗口级 TTL 缓存，无需长连接池）。多副本 + 负载均衡即可分布式。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { maskToken, authenticate } from './auth';
import { ERROR_HTTP_STATUS, toErrorDto, type RelayErrorDto } from './errors';
import type { ConcurrencyQueue } from '../queue';
import type { EdgeEngine } from '../engines/edge';
import type { VoiceCatalog } from '../engines/edge/voices';
import type { RelayConfig } from '../config';

export interface ServerDeps {
  config: RelayConfig;
  engine: EdgeEngine;
  voices: VoiceCatalog;
  queue: ConcurrencyQueue;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/** 读取请求体（上限保护） */
function readBody(request: IncomingMessage, limitBytes: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limitBytes) {
        request.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { ...JSON_HEADERS, 'Content-Length': Buffer.byteLength(payload) });
  response.end(payload);
}

function sendBinary(response: ServerResponse, mimeType: string, audio: Uint8Array): void {
  response.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': audio.length,
    'Cache-Control': 'no-store',
  });
  response.end(audio);
}

function sendError(response: ServerResponse, dto: RelayErrorDto): void {
  sendJson(response, ERROR_HTTP_STATUS[dto.code], dto);
}

/** 把任意错误归一为错误 DTO；带 dto 的并发队列拒绝优先透出 */
function toDto(error: unknown): RelayErrorDto {
  const dto = (error as { dto?: RelayErrorDto }).dto;
  if (dto) return dto;
  const message = error instanceof Error ? error.message : String(error);
  if (/BAD_REQUEST/.test(message)) return toErrorDto('BAD_REQUEST', message.replace(/^BAD_REQUEST:\s*/, ''));
  if (/timeout|timed out|超时/i.test(message)) return toErrorDto('TIMEOUT', message);
  if (/HTTP 4\d\d|auth|鉴权|令牌|403|401/i.test(message)) return toErrorDto('UPSTREAM_AUTH', message);
  return toErrorDto('UPSTREAM_5XX', message);
}

export function createRelayServer(deps: ServerDeps): Server {
  const { config } = deps;

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://relay.local');
    const path = url.pathname;

    try {
      // /v1/health 不需要鉴权（连通性自检要在配置 Token 之前就能跑）
      if (path === '/v1/health' && request.method === 'GET') {
        return handleHealth(deps, response);
      }

      const auth = authenticate(request, config.relayAuthToken);
      if (!auth.ok) {
        return sendError(response, toErrorDto('UPSTREAM_AUTH', `鉴权失败：${auth.error ?? 'invalid token'}`));
      }

      if (path === '/v1/voices' && request.method === 'GET') {
        return handleVoices(deps, response);
      }

      if (path === '/v1/tts' && request.method === 'POST') {
        return handleTts(deps, request, response, auth.clientId);
      }

      return sendJson(response, 404, { ok: false, code: 'NOT_FOUND', message: `unknown route: ${request.method} ${path}` });
    } catch (error) {
      return sendError(response, toDto(error));
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[tts-relay] listening on http://${config.host}:${config.port} ` +
        `endpoint=${config.edgeEndpoint} format=${config.outputFormat} ` +
        `concurrency=${config.maxConcurrency}/${config.maxPerClient} auth=${maskToken(config.relayAuthToken)}`
    );
  });

  return server;
}

async function handleTts(deps: ServerDeps, request: IncomingMessage, response: ServerResponse, clientId: string): Promise<void> {
  const { engine, queue } = deps;
  let body: string;
  try {
    body = await readBody(request, 1024 * 1024);
  } catch {
    return sendError(response, toErrorDto('BAD_REQUEST', '请求体过大（上限 1MB）'));
  }

  let payload: { text?: string; voice?: string; speed?: number; format?: string };
  try {
    payload = JSON.parse(body);
  } catch {
    return sendError(response, toErrorDto('BAD_REQUEST', '请求体不是合法 JSON'));
  }

  const text = typeof payload.text === 'string' ? payload.text : '';
  const voice = typeof payload.voice === 'string' ? payload.voice : '';
  const speed = typeof payload.speed === 'number' ? payload.speed : 1.0;

  if (!text.trim()) {
    return sendError(response, toErrorDto('BAD_REQUEST', 'text 不能为空'));
  }
  if (!voice.trim()) {
    return sendError(response, toErrorDto('BAD_REQUEST', 'voice 不能为空'));
  }

  try {
    const result = await queue.run(clientId, () =>
      engine.synthesize({ text, voice, speed: speed >= 0.5 && speed <= 2.5 ? speed : 1.0 })
    );
    return sendBinary(response, result.mimeType, result.audio);
  } catch (error) {
    return sendError(response, toDto(error));
  }
}

async function handleVoices(deps: ServerDeps, response: ServerResponse): Promise<void> {
  const { voices } = deps;
  try {
    const list = await voices.list();
    return sendJson(response, 200, { ok: true, count: list.length, voices: list });
  } catch (error) {
    return sendError(response, toDto(error));
  }
}

async function handleHealth(deps: ServerDeps, response: ServerResponse): Promise<void> {
  const { voices, config } = deps;
  const started = Date.now();
  try {
    // 健康检查顺带探活上游：拉一次音色列表（令牌 / muid / 端点全链路）
    await voices.refresh();
    const list = await voices.list();
    return sendJson(response, 200, {
      ok: true,
      engines: ['edge'],
      endpoint: config.edgeEndpoint,
      upstreamLatencyMs: Date.now() - started,
      voices: list.length,
    });
  } catch (error) {
    // 后端起来但上游不可达：仍返回 200 + 诊断信息（扩展侧据文案分级引导）
    return sendJson(response, 200, {
      ok: true,
      engines: ['edge'],
      endpoint: config.edgeEndpoint,
      upstreamLatencyMs: Date.now() - started,
      upstreamError: error instanceof Error ? error.message : String(error),
    });
  }
}
