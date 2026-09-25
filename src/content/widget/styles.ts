/**
 * 悬浮窗样式聚合器：按原始级联顺序拼接各分区段，注入 Shadow DOM 的 <style>。
 *
 * 单段 CSS 超过 500 行（原则 2），按分区注释拆为 base / panel / controls / theme
 * 四段，本文件只做顺序拼接；切点取在分区边界，拼接结果与拆分前逐字节相同。
 */
import { WIDGET_STYLES_BASE } from './styles-base';
import { WIDGET_STYLES_PANEL } from './styles-panel';
import { WIDGET_STYLES_CONTROLS } from './styles-controls';
import { WIDGET_STYLES_THEME } from './styles-theme';

export const WIDGET_STYLES = [WIDGET_STYLES_BASE, WIDGET_STYLES_PANEL, WIDGET_STYLES_CONTROLS, WIDGET_STYLES_THEME].join('');
