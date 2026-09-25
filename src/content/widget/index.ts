/**
 * widget —— 网页悬浮窗的创建与挂载（Shadow DOM 隔离）。
 *
 * 原单文件 widget.ts 2020 行，其中约 1800 行是
 * SVG 图标精灵、HTML 结构模板与 CSS，真正的创建逻辑只有几十行。按「资源与
 * 装配分离」拆为本目录：
 *  - icons.ts：SVG 图标精灵（静态）
 *  - template.ts：HTML 结构模板（i18n 插值 + 音色面板折叠态）
 *  - styles.ts：样式（亮 / 暗主题）
 *  - 本文件：创建流程（幂等、并发安全）与 Shadow DOM 挂载
 *
 * 挂载顺序保持「先挂载后填充」：先建 host + Shadow DOM，再塞 style 与 widget，
 * 最后才调用 _widgetInitializer 做事件绑定与状态恢复 —— initializer 依赖
 * 已存在的 DOM。getWidget() 可能为 null（悬浮窗未创建），调用方必须判空。
 */
import { loadInterfaceLanguage } from '../i18n';
import { state } from '../state';
import { buildWidgetHTML } from './template';
import { WIDGET_STYLES } from './styles';

/**
 * 初始化钩子：由 index.ts 注册 initWidget，避免 widget ↔ index 循环依赖。
 * createWidget 创建并挂载 Shadow DOM 后调用它完成事件绑定与状态恢复。
 */
let _widgetInitializer: ((widget: HTMLElement) => Promise<void> | void) | null = null;
export function setWidgetInitializer(fn: (widget: HTMLElement) => Promise<void> | void): void {
  _widgetInitializer = fn;
}
export function getWidget(): HTMLElement | null {
  return (
    ((document.getElementById('tts-widget-host') as any)?.shadowRoot?.getElementById('edge-tts-widget') as any) ||
    (document.getElementById('edge-tts-widget') as any)
  );
}

export function getWidgetElementById(id: string): HTMLElement | null {
  const widget = getWidget();
  if (!widget) return null;
  const root: any = widget.getRootNode();
  return root instanceof ShadowRoot && root.getElementById ? root.getElementById(id) : document.getElementById(id);
}

function readVoicePanelControlsCollapsedPref(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['voicePanelControlsCollapsed'], (data) => {
          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }
          resolve(data && data.voicePanelControlsCollapsed === true);
        });
        return;
      }
    } catch (e) {
      /* ignore */
    }
    try {
      const stored = localStorage.getItem('tts-settings');
      if (stored) {
        const o = JSON.parse(stored);
        resolve(o && o.voicePanelControlsCollapsed === true);
        return;
      }
    } catch (e) {
      /* ignore */
    }
    resolve(false);
  });
}

let _widgetCreating: Promise<void> | null = null;

/**
 * 创建悬浮窗（幂等）：已存在或正在创建中时复用，避免并发调用（如 Alt+P 命令与
 * 选中 FAB / 开关命令在同一时刻触发）产生重复悬浮窗。
 */
export async function createWidget(): Promise<void> {
  if (getWidget()) return;
  if (_widgetCreating) return _widgetCreating;
  _widgetCreating = doCreateWidget().finally(() => {
    _widgetCreating = null;
  });
  return _widgetCreating;
}

async function doCreateWidget(): Promise<void> {
  // Load interface language if not already loaded
  if (!state.i18nMessages) {
    await loadInterfaceLanguage();
  }

  const voicePanelCollapsed = await readVoicePanelControlsCollapsedPref();

  // Create widget container
  const widget = document.createElement('div');
  widget.id = 'edge-tts-widget';
  widget.innerHTML = buildWidgetHTML(voicePanelCollapsed);

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = WIDGET_STYLES;

  // Use Shadow DOM to isolate player styles from page CSS
  const host = document.createElement('div');
  host.id = 'tts-widget-host';
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999999';
  const shadowRoot = host.attachShadow({ mode: 'open' });
  shadowRoot.appendChild(style);
  shadowRoot.appendChild(widget);
  document.body.appendChild(host);
  window.ttsWidgetShadowRoot = shadowRoot;

  // Initialize widget functionality (including auth check)
  if (_widgetInitializer) await _widgetInitializer(widget);
}
