/** content 侧日志器：统一前缀 WebReader/content，可按模块细化前缀 */
import { createLogger, setGlobalLevel, type Logger } from '../shared/log';

export { setGlobalLevel };

/** content 层默认日志器 */
export const logger = createLogger('WebReader/content');

/** 按模块创建日志器，如 createContentLogger('player') → WebReader/content/player */
export function createContentLogger(module: string): Logger {
  return createLogger(`WebReader/content/${module}`);
}
