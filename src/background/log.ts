/** background 侧日志器：统一前缀 WebReader/background */
import { createLogger, setGlobalLevel } from '../shared/log';

export { setGlobalLevel };

export const logger = createLogger('WebReader/background');
