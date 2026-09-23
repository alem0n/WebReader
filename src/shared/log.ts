/**
 * 日志模块（纯逻辑，不持有任何层 state）。
 *
 * 借鉴 kiss-translator 的 libs/log.js：五级日志（DEBUG/INFO/WARN/ERROR/SILENT）、
 * 前缀区分模块、浏览器彩色输出、动态调级。三层各用不同前缀实例化：
 * WebReader/content、WebReader/popup、WebReader/background（content 侧可按模块再细化）。
 *
 * 默认 INFO 级：排障时可用 setGlobalLevel('DEBUG') 打开细节日志。
 */

/** 日志级别（数值越大越安静，SILENT 屏蔽全部） */
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

interface LevelMeta {
  value: LogLevel;
  name: string;
  color: string;
}

const LEVELS: Record<LogLevel, LevelMeta> = {
  [LogLevel.DEBUG]: { value: LogLevel.DEBUG, name: 'DEBUG', color: '#6495ED' },
  [LogLevel.INFO]: { value: LogLevel.INFO, name: 'INFO', color: '#4CAF50' },
  [LogLevel.WARN]: { value: LogLevel.WARN, name: 'WARN', color: '#FFC107' },
  [LogLevel.ERROR]: { value: LogLevel.ERROR, name: 'ERROR', color: '#F44336' },
  [LogLevel.SILENT]: { value: LogLevel.SILENT, name: 'SILENT', color: '' },
};

function findLevelByName(name: string): LevelMeta | undefined {
  const upper = String(name).toUpperCase();
  return Object.values(LEVELS).find((l) => l.name === upper);
}

interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
}

/** 浏览器环境（content / popup）才用 %c 彩色输出；MV3 Service Worker 与 Node 降级纯文本 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

// 全局注册表：setGlobalLevel 可一次性调整所有已创建的日志器
const registry: Logger[] = [];
let globalLevel: LogLevel = LogLevel.INFO;

export class Logger {
  readonly prefix: string;
  private _level: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || 'WebReader';
    this._level = options.level ?? globalLevel;
    registry.push(this);
  }

  get level(): LogLevel {
    return this._level;
  }

  /** 动态设置日志级别，可传 LogLevel / 级别名 / 数值；非法值保留原级别并告警 */
  setLevel(level: LogLevel | string | number): void {
    let meta: LevelMeta | undefined;
    if (typeof level === 'string') {
      meta = findLevelByName(level);
    } else if (typeof level === 'number') {
      meta = LEVELS[level as LogLevel];
    }
    if (!meta) {
      this.warn(`Invalid log level: ${String(level)}. Keeping ${LEVELS[this._level].name}.`);
      return;
    }
    if (this._level !== meta.value) {
      this._level = meta.value;
      // 直接用 console 输出，避免被新级别（尤其 SILENT）吞掉
      console.log(`[${this.prefix}] Log level set to ${meta.name}`);
    }
  }

  private _getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case LogLevel.ERROR:
        return console.error.bind(console);
      case LogLevel.WARN:
        return console.warn.bind(console);
      case LogLevel.INFO:
        return console.info.bind(console);
      default:
        return console.log.bind(console);
    }
  }

  private _emit(level: LevelMeta, ...args: unknown[]): void {
    if (level.value < this._level) return;

    const timestamp = new Date().toISOString();
    const prefixStr = `[${this.prefix}]`;
    const levelStr = `[${level.name}]`;
    const method = this._getConsoleMethod(level.value);

    if (isBrowser()) {
      method(
        `%c${timestamp} %c${prefixStr} %c${levelStr}`,
        'color: gray; font-weight: lighter;',
        'color: #7c57e0; font-weight: bold;',
        `color: ${level.color}; font-weight: bold;`,
        ...args
      );
    } else {
      method(timestamp, prefixStr, levelStr, ...args);
    }
  }

  debug(...args: unknown[]): void {
    this._emit(LEVELS[LogLevel.DEBUG], ...args);
  }

  info(...args: unknown[]): void {
    this._emit(LEVELS[LogLevel.INFO], ...args);
  }

  warn(...args: unknown[]): void {
    this._emit(LEVELS[LogLevel.WARN], ...args);
  }

  error(...args: unknown[]): void {
    this._emit(LEVELS[LogLevel.ERROR], ...args);
  }
}

/** 创建带前缀的日志器；level 省略时跟随全局级别 */
export function createLogger(prefix: string, level?: LogLevel): Logger {
  return new Logger({ prefix, level });
}

/** 一次性调整所有已创建日志器的级别（排障用） */
export function setGlobalLevel(level: LogLevel | string | number): void {
  for (const l of registry) {
    l.setLevel(level);
  }
}
