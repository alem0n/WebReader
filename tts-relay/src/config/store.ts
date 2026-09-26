/**
 * 配置文件持久化：解析路径、读取、原子写入。
 *
 * 文件位置：二进制所在目录的 config.json。
 * - 打包成单文件可执行（Node SEA / pkg）时，取可执行文件所在目录；
 * - node 运行（node dist/index.js）时，入口在 dist/，取其上一级（项目根），
 *   避免把配置文件混进会被构建清空的 dist/。
 *
 * 可用 RELAY_CONFIG_FILE 环境变量或 --config <path> 参数覆盖路径（测试 / 高级用法）。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_CONFIG, resolveConfig, type RelayConfig } from './index';
import { isPackaged, packagedAppDir } from '../packaging/sea';

const CONFIG_FILE_NAME = 'config.json';
const LOG_FILE_NAME = 'tts-relay.log';

function argValue(flag: string): string | null {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === flag) return argv[i + 1] ?? null;
    const prefix = `${flag}=`;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

/** 应用根目录（配置文件与可执行文件同目录的落点） */
export function resolveAppDir(): string {
  if (isPackaged()) return packagedAppDir();
  const packaged = (process as unknown as { pkg?: boolean }).pkg === true;
  if (packaged) return dirname(process.execPath);
  // 编译产物在 dist/<子目录>/，取两级向上到项目根；__dirname 在运行时是 dist/config
  return resolve(__dirname, '..', '..');
}

export function resolveConfigFilePath(): string {
  const override = argValue('--config') || process.env.RELAY_CONFIG_FILE || '';
  if (override.trim()) return resolve(override);
  return resolve(resolveAppDir(), CONFIG_FILE_NAME);
}

/** 后台运行时的日志文件路径（与配置文件同目录，托盘模式无控制台可看输出） */
export function resolveLogFilePath(): string {
  const override = process.env.RELAY_LOG_FILE || '';
  if (override.trim()) return resolve(override);
  return resolve(resolveAppDir(), LOG_FILE_NAME);
}

/**
 * 读取配置文件为部分覆盖层。
 *
 * 文件不存在或内容非法时返回 null（回退到环境变量 / 默认值），并在控制台提示，
 * 保证坏文件不会让进程起不来。
 */
export function readConfigFile(): Partial<RelayConfig> | null {
  const filePath = resolveConfigFilePath();
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    // 文件不存在：首次启动，属正常情况
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`[tts-relay] 配置文件不是合法的对象，已忽略：${filePath}`);
      return null;
    }
    return parsed as Partial<RelayConfig>;
  } catch {
    console.warn(`[tts-relay] 配置文件 JSON 解析失败，已忽略：${filePath}`);
    return null;
  }
}

/** 原子写入完整配置（先写临时文件再 rename，避免被杀死时写一半） */
export function writeConfigFile(config: RelayConfig): void {
  const filePath = resolveConfigFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
}

/**
 * 确保配置文件存在：首次启动时尚无文件时写入一份完整配置。无头模式不产生任何文件；
 * 此函数供「需要落盘一份当前配置」的场景调用。
 */
export function ensureConfigFile(config: RelayConfig): void {
  const filePath = resolveConfigFilePath();
  try {
    readFileSync(filePath, 'utf8');
    return;
  } catch {
    writeConfigFile(config);
  }
}

/**
 * 装载配置：环境变量（显式）> 配置文件 > 默认值。
 *
 * 与旧实现签名一致，启动入口与「重新加载配置」共用。
 */
export function loadConfig(): RelayConfig {
  return resolveConfig(readConfigFile());
}

/** 配置文件是否还不存在（首次启动，托盘可据此给一次提示） */
export function configFilePath(): string {
  return resolveConfigFilePath();
}

/** 默认值再导出一份，供菜单等展示场景使用 */
export { DEFAULT_CONFIG };
