/**
 * per-client 并发上限 + 限流队列（自保，防被扩展突发打爆上游）。
 *
 * 合成是「每段一条短连接」，进程内不需要长连接池；本队列只做并发槽位控制。
 */
import { toErrorDto, type RelayErrorCode } from '../api/errors';

interface QueueEntry {
  clientId: string;
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class ConcurrencyQueue {
  private active = 0;
  private readonly waiting: QueueEntry[] = [];
  private readonly activePerClient = new Map<string, number>();

  constructor(
    private readonly maxConcurrency = 4,
    private readonly maxPerClient = 2,
    private readonly maxQueueSize = 64
  ) {}

  /** 排队执行任务；超限或队列满时拒绝 */
  async run<T>(clientId: string, task: () => Promise<T>): Promise<T> {
    if (this.waiting.length >= this.maxQueueSize) {
      throw toRelayError('RATE_LIMIT', '服务繁忙，请稍后重试（队列已满）');
    }
    const inFlight = this.activePerClient.get(clientId) ?? 0;
    if (inFlight >= this.maxPerClient) {
      throw toRelayError('RATE_LIMIT', '已达单客户端并发上限，请稍后重试');
    }

    return new Promise<T>((resolve, reject) => {
      this.waiting.push({ clientId, task, resolve: resolve as (v: unknown) => void, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (
      this.active < this.maxConcurrency &&
      this.waiting.length > 0 &&
      (this.activePerClient.get(this.waiting[0].clientId) ?? 0) < this.maxPerClient
    ) {
      const entry = this.waiting.shift() as QueueEntry;
      this.active++;
      this.activePerClient.set(entry.clientId, (this.activePerClient.get(entry.clientId) ?? 0) + 1);
      void entry
        .task()
        .then((value) => entry.resolve(value))
        .catch((reason) => entry.reject(reason))
        .finally(() => {
          this.active--;
          const remaining = (this.activePerClient.get(entry.clientId) ?? 1) - 1;
          if (remaining <= 0) this.activePerClient.delete(entry.clientId);
          else this.activePerClient.set(entry.clientId, remaining);
          this.pump();
        });
    }
  }
}

function toRelayError(code: RelayErrorCode, message: string): Error & { dto: ReturnType<typeof toErrorDto> } {
  const dto = toErrorDto(code, message);
  const error = new Error(message) as Error & { dto: typeof dto };
  error.dto = dto;
  return error;
}
