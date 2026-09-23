/** widget (migrated from content.js) */
import { i18n, loadInterfaceLanguage } from './i18n';
import { state } from './state';

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

function readVoicePanelControlsCollapsedPref() {
  return new Promise((resolve) => {
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
  widget.innerHTML = `
    <!-- SVG Icon Sprites：UI 图标统一加粗描边，贴合 DESIGN.md 的 mascot 描边风格 -->
    <svg style="display: none;">
      <defs>
        <symbol id="icon-play" viewBox="0 0 24 24">
          <path d="M8 5.5v13l11-6.5z"/>
        </symbol>
        <symbol id="icon-pause" viewBox="0 0 24 24">
          <rect x="6.5" y="5" width="4" height="14" rx="1.6"/>
          <rect x="13.5" y="5" width="4" height="14" rx="1.6"/>
        </symbol>
        <symbol id="icon-stop" viewBox="0 0 24 24">
          <rect x="6.5" y="6.5" width="11" height="11" rx="2.4"/>
        </symbol>
        <symbol id="icon-prev" viewBox="0 0 24 24">
          <path d="M10.5 18.2V5.8L3.2 12l7.3 6.2zm.8-6.2l7.5 6.2V5.8l-7.5 6.2z"/>
        </symbol>
        <symbol id="icon-next" viewBox="0 0 24 24">
          <path d="M4 18.2l7.5-6.2L4 5.8v12.4zm9-12.4v12.4l7.3-6.2L13 5.8z"/>
        </symbol>
        <symbol id="icon-clear" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </symbol>
        <!-- Theme Toggle Icons -->
        <symbol id="icon-sun" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"/>
          </g>
        </symbol>

        <symbol id="icon-moon" viewBox="0 0 24 24">
          <path d="M9.37,5.51C9.19,6.15,9.1,6.82,9.1,7.5c0,4.08,3.32,7.4,7.4,7.4c0.68,0,1.35-0.09,1.99-0.27C17.45,17.19,14.93,19,12,19 c-3.86,0-7-3.14-7-7C5,9.07,6.81,6.55,9.37,5.51z M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36 c-0.98,1.37-2.58,2.26-4.4,2.26c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z"/>
        </symbol>

        <symbol id="icon-minimize" viewBox="0 0 24 24">
          <path d="M19.5 13h-15v-2h15v2z"/>
        </symbol>

        <symbol id="icon-expand" viewBox="0 0 24 24">
          <path d="M12 5.5l6.5 13h-13L12 5.5z"/>
        </symbol>

        <symbol id="icon-voice-panel-up" viewBox="0 0 24 24">
          <path d="M12 4.5L20.5 19.5H3.5L12 4.5z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
        </symbol>

        <symbol id="icon-voice-panel-down" viewBox="0 0 24 24">
          <path d="M12 19.5L3.5 4.5h17L12 19.5z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
        </symbol>

        <!-- App Icon：圆角绿底 + 白色播放三角（品牌标识） -->
        <symbol id="icon-app-neon" viewBox="0 0 24 24">
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="#58cc02" stroke="#000437" stroke-width="2"/>
          <path d="M10 8.4l6.2 3.6-6.2 3.6z" fill="#ffffff"/>
        </symbol>

        <!-- Document with Play Icon 已移到 popup 快捷操作区，悬浮窗不再使用 -->

        <!-- Two Stacked Cards with Play Icon (Paste from clipboard) -->
        <symbol id="icon-two-pages-play" viewBox="0 0 24 24">
          <rect x="6.5" y="7.5" width="9" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2" opacity="0.45"/>
          <rect x="4" y="5" width="9" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M9.5 13.5l2.8-1.7v3.4l-2.8-1.7z" fill="currentColor"/>
        </symbol>

        <!-- Square Flag Icons：圆角方块 + 国旗配色 -->
        <symbol id="flag-en-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#012169"/>
          <path d="M2.5 2.5 L21.5 21.5 M21.5 2.5 L2.5 21.5" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
          <path d="M2.5 2.5 L21.5 21.5 M21.5 2.5 L2.5 21.5" stroke="#C8102E" stroke-width="1.5" stroke-linecap="round"/>
          <rect x="1" y="9.5" width="22" height="5" fill="#ffffff"/>
          <rect x="9.5" y="1" width="5" height="22" fill="#ffffff"/>
          <rect x="1" y="11" width="22" height="2" fill="#C8102E"/>
          <rect x="11" y="1" width="2" height="22" fill="#C8102E"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-de-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="7.33" rx="3" ry="3" fill="#000000"/>
          <rect x="1" y="8.33" width="22" height="7.34" fill="#dd0000"/>
          <rect x="1" y="15.67" width="22" height="7.33" rx="3" ry="3" fill="#ffce00"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-fr-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ffffff"/>
          <rect x="1" y="1" width="7.3" height="22" fill="#0055a4"/>
          <rect x="15.7" y="1" width="7.3" height="22" fill="#ef4135"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-es-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="5.5" rx="3" ry="3" fill="#aa151b"/>
          <rect x="1" y="6.5" width="22" height="11" fill="#f1bf00"/>
          <rect x="1" y="17.5" width="22" height="5.5" rx="3" ry="3" fill="#aa151b"/>
          <rect x="3.5" y="9" width="4" height="6" rx="0.3" fill="#ffffff" stroke="#aa151b" stroke-width="0.3"/>
          <rect x="3.8" y="9.3" width="1.4" height="1.4" fill="#aa151b"/>
          <rect x="5.8" y="9.3" width="1.4" height="1.4" fill="#aa151b"/>
          <rect x="3.8" y="11.3" width="1.4" height="1.4" fill="#aa151b"/>
          <rect x="5.8" y="11.3" width="1.4" height="1.4" fill="#aa151b"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-it-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ffffff"/>
          <rect x="1" y="1" width="7.3" height="22" fill="#009246"/>
          <rect x="15.7" y="1" width="7.3" height="22" fill="#ce2b37"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-pt-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="9.8" height="22" rx="3" ry="3" fill="#006600"/>
          <rect x="10.8" y="1" width="12.2" height="22" rx="3" ry="3" fill="#da020e"/>
          <circle cx="10.8" cy="12" r="3.5" fill="none" stroke="#ffd700" stroke-width="0.8"/>
          <circle cx="10.8" cy="12" r="2.8" fill="none" stroke="#ffd700" stroke-width="0.6" transform="rotate(45 10.8 12)"/>
          <rect x="8.5" y="9.5" width="4.6" height="5" rx="0.5" fill="#ffffff" stroke="#da020e" stroke-width="0.4"/>
          <circle cx="10.8" cy="11" r="0.6" fill="#003f87"/>
          <circle cx="9.5" cy="10.5" r="0.4" fill="#003f87"/>
          <circle cx="12.1" cy="10.5" r="0.4" fill="#003f87"/>
          <circle cx="9.5" cy="12.5" r="0.4" fill="#003f87"/>
          <circle cx="12.1" cy="12.5" r="0.4" fill="#003f87"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-pl-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="11" rx="3" ry="3" fill="#ffffff"/>
          <rect x="1" y="12" width="22" height="11" rx="3" ry="3" fill="#d4213d"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-cn-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#de2910"/>
          <circle cx="8" cy="9.5" r="2.2" fill="#ffde00"/>
          <circle cx="12" cy="7.5" r="1.1" fill="#ffde00"/>
          <circle cx="13.2" cy="9.5" r="1" fill="#ffde00"/>
          <circle cx="12.2" cy="11.7" r="1" fill="#ffde00"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-jp-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ffffff"/>
          <circle cx="12" cy="12" r="4.2" fill="#bc002d"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-kr-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ffffff"/>
          <circle cx="12" cy="12" r="4" fill="none"/>
          <path d="M12 8 A4 4 0 0 1 12 16 A2 2 0 0 0 12 12 A2 2 0 0 1 12 8 Z" fill="#C60C30"/>
          <path d="M12 16 A4 4 0 0 1 12 8 A2 2 0 0 0 12 12 A2 2 0 0 1 12 16 Z" fill="#003478"/>
          <rect x="3" y="3" width="2" height="0.8" fill="#000000"/>
          <rect x="3" y="4.2" width="2" height="0.8" fill="#000000"/>
          <rect x="3" y="5.4" width="2" height="0.8" fill="#000000"/>
          <rect x="19" y="3" width="2" height="0.8" fill="#000000"/>
          <rect x="19" y="4.2" width="0.8" height="0.8" fill="#000000"/>
          <rect x="20.2" y="4.2" width="0.8" height="0.8" fill="#000000"/>
          <rect x="19" y="5.4" width="2" height="0.8" fill="#000000"/>
          <rect x="3" y="17.8" width="2" height="0.8" fill="#000000"/>
          <rect x="3" y="19" width="0.8" height="0.8" fill="#000000"/>
          <rect x="4.2" y="19" width="0.8" height="0.8" fill="#000000"/>
          <rect x="3" y="20.2" width="2" height="0.8" fill="#000000"/>
          <rect x="19" y="17.8" width="0.8" height="0.8" fill="#000000"/>
          <rect x="20.2" y="17.8" width="0.8" height="0.8" fill="#000000"/>
          <rect x="19" y="19" width="2" height="0.8" fill="#000000"/>
          <rect x="19" y="20.2" width="0.8" height="0.8" fill="#000000"/>
          <rect x="20.2" y="20.2" width="0.8" height="0.8" fill="#000000"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-sa-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#006c35"/>
          <rect x="6.5" y="14" width="11" height="2" rx="1" fill="#ffffff"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-in-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="7.33" rx="3" ry="3" fill="#ff9933"/>
          <rect x="1" y="8.33" width="22" height="7.34" fill="#ffffff"/>
          <rect x="1" y="15.67" width="22" height="7.33" rx="3" ry="3" fill="#138808"/>
          <circle cx="12" cy="12" r="1.8" fill="none" stroke="#000080" stroke-width="0.8"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-tr-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#e30a17"/>
          <circle cx="10.5" cy="12" r="3.2" fill="#ffffff"/>
          <circle cx="11.2" cy="12" r="2.4" fill="#e30a17"/>
          <circle cx="13.6" cy="12" r="1.4" fill="#ffffff"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-nl-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="7.33" rx="3" ry="3" fill="#ae1c28"/>
          <rect x="1" y="8.33" width="22" height="7.34" fill="#ffffff"/>
          <rect x="1" y="15.67" width="22" height="7.33" rx="3" ry="3" fill="#21468b"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-se-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#005293"/>
          <rect x="7" y="1" width="4" height="22" fill="#fecb00"/>
          <rect x="1" y="10" width="22" height="4" fill="#fecb00"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-ru-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="7.33" rx="3" ry="3" fill="#ffffff"/>
          <rect x="1" y="8.33" width="22" height="7.34" fill="#0039a6"/>
          <rect x="1" y="15.67" width="22" height="7.33" rx="3" ry="3" fill="#d52b1e"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-da-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#c8102e"/>
          <rect x="7" y="1" width="4" height="22" fill="#ffffff"/>
          <rect x="1" y="10" width="22" height="4" fill="#ffffff"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-he-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ffffff"/>
          <rect x="1" y="1" width="22" height="2.5" rx="3" ry="3" fill="#0038b8"/>
          <rect x="1" y="20.5" width="22" height="2.5" rx="3" ry="3" fill="#0038b8"/>
          <path d="M12 9 L15.2 13.5 L8.8 13.5 Z" fill="#0038b8"/>
          <path d="M12 15 L8.8 10.5 L15.2 10.5 Z" fill="#0038b8"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-fi-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ffffff"/>
          <rect x="7" y="1" width="5" height="22" fill="#003580"/>
          <rect x="1" y="9.75" width="22" height="4.5" fill="#003580"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-no-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ba0c2f"/>
          <rect x="7" y="1" width="5" height="22" fill="#ffffff"/>
          <rect x="1" y="9.75" width="22" height="4.5" fill="#ffffff"/>
          <rect x="7.75" y="1" width="3" height="22" fill="#00205b"/>
          <rect x="1" y="10.5" width="22" height="2.5" fill="#00205b"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-us-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="2.75" fill="#ffffff"/>
          <rect x="1" y="3.75" width="22" height="2.75" fill="#bf0a30"/>
          <rect x="1" y="6.5" width="22" height="2.75" fill="#ffffff"/>
          <rect x="1" y="9.25" width="22" height="2.75" fill="#bf0a30"/>
          <rect x="1" y="12" width="22" height="2.75" fill="#ffffff"/>
          <rect x="1" y="14.75" width="22" height="2.75" fill="#bf0a30"/>
          <rect x="1" y="17.5" width="22" height="2.75" fill="#ffffff"/>
          <rect x="1" y="20.25" width="22" height="2.75" fill="#bf0a30"/>
          <rect x="1" y="1" width="9.17" height="11" fill="#3c3b6e"/>
          <circle cx="3.5" cy="3.2" r="0.5" fill="#ffffff"/>
          <circle cx="6" cy="3.2" r="0.5" fill="#ffffff"/>
          <circle cx="8.5" cy="3.2" r="0.5" fill="#ffffff"/>
          <circle cx="4.75" cy="5" r="0.5" fill="#ffffff"/>
          <circle cx="7.25" cy="5" r="0.5" fill="#ffffff"/>
          <circle cx="3.5" cy="6.8" r="0.5" fill="#ffffff"/>
          <circle cx="6" cy="6.8" r="0.5" fill="#ffffff"/>
          <circle cx="8.5" cy="6.8" r="0.5" fill="#ffffff"/>
          <circle cx="4.75" cy="8.6" r="0.5" fill="#ffffff"/>
          <circle cx="7.25" cy="8.6" r="0.5" fill="#ffffff"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-za-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#007749"/>
          <path d="M1 1 L23 23 M23 1 L1 23" stroke="#ffb81c" stroke-width="3" stroke-linecap="round"/>
          <path d="M1 1 L23 23 M23 1 L1 23" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
          <path d="M1 12 L12 1 L23 12 L12 23 Z" fill="#002395"/>
          <path d="M1 12 L12 1 L23 12 L12 23 Z" fill="none" stroke="#ffffff" stroke-width="1.2"/>
          <path d="M1 12 L12 1" stroke="#e03c31" stroke-width="1.5"/>
          <path d="M12 23 L23 12" stroke="#e03c31" stroke-width="1.5"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-ae-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#00732f"/>
          <rect x="1" y="1" width="5.5" height="22" fill="#ffffff"/>
          <rect x="6.5" y="1" width="5.5" height="22" fill="#000000"/>
          <rect x="12" y="1" width="11" height="22" fill="#ff0000"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-au-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#00008b"/>
          <rect x="1" y="1" width="9" height="9" fill="#012169"/>
          <path d="M2 2 L10 2 M2 4 L10 4 M2 6 L10 6 M2 8 L10 8 M2 2 L2 10 M4 2 L4 10 M6 2 L6 10 M8 2 L8 10" stroke="#ffffff" stroke-width="0.6"/>
          <path d="M2 2 L10 10 M2 10 L10 2" stroke="#c8102e" stroke-width="0.8"/>
          <path d="M2 5 L10 5 M5 2 L5 10" stroke="#c8102e" stroke-width="1.2"/>
          <circle cx="17" cy="7" r="1.2" fill="#ffffff"/>
          <circle cx="20" cy="6" r="0.8" fill="#ffffff"/>
          <circle cx="19" cy="9" r="0.8" fill="#ffffff"/>
          <circle cx="15" cy="9" r="0.8" fill="#ffffff"/>
          <circle cx="17" cy="11" r="0.8" fill="#ffffff"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>

        <symbol id="flag-ca-square" viewBox="0 0 24 24">
          <rect x="1" y="1" width="22" height="22" rx="3" fill="#ff0000"/>
          <rect x="7" y="1" width="10" height="22" fill="#ffffff"/>
          <path d="M12 5 L13 9 L17 10 L13.5 13 L14.5 17 L12 14.5 L9.5 17 L10.5 13 L7 10 L11 9 Z" fill="#ff0000"/>
          <rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="#000437" stroke-width="1.4"/>
        </symbol>
      </defs>
    </svg>

    <div class="tts-widget-header" id="tts-widget-header">
      <div class="header-left">
        <button id="user-menu-button" class="user-menu-button hidden" type="button" title="Account">
          <img id="user-avatar-img" class="user-avatar-img hidden" alt="" />
          <span class="user-avatar-initial">U</span>
        </button>
        <svg class="header-app-icon" width="30" height="30" aria-hidden="true">
          <use href="#icon-app-neon"></use>
        </svg>
        <span class="header-app-name">WebReader</span>
      </div>
      <div class="header-right">
        <div class="language-select-wrapper">
          <button id="language-button" class="language-button" type="button" aria-haspopup="listbox" aria-expanded="false" title="Interface language">
            <svg class="flag-icon" width="22" height="22">
              <use href="#flag-en-square"></use>
            </svg>
          </button>
          <!-- Native select kept for logic and accessibility -->
          <select id="language-select" class="language-select-native" aria-hidden="true" tabindex="-1">
            <option value="en">en</option>
            <option value="zh_CN">zh</option>
          </select>
        </div>
        <div class="header-buttons">
          <button class="tts-widget-btn tts-widget-minimize" id="tts-widget-minimize" title="${i18n('minimize')}" type="button">
            <svg width="18" height="18" aria-hidden="true">
              <use href="#icon-minimize"></use>
            </svg>
          </button>
          <button class="tts-widget-btn tts-widget-theme-toggle" id="tts-widget-theme-toggle" title="${i18n('toggle_theme')}" type="button">
            <svg width="18" height="18" aria-hidden="true">
              <use href="#icon-moon"></use>
            </svg>
          </button>
          <button class="tts-widget-btn tts-widget-close" id="tts-widget-close" title="${i18n('close')}" type="button">
            <svg width="16" height="16" aria-hidden="true">
              <use href="#icon-clear"></use>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- User overlay menu (covers entire widget, direct child of widget) -->
    <div id="user-menu" class="user-menu hidden">
      <span id="user-menu-email" class="user-menu-email"></span>
      <div class="user-menu-actions">
        <button id="user-menu-cancel" type="button" class="user-menu-cancel-btn">
          <span id="user-menu-cancel-text">${i18n('cancel') !== 'cancel' ? i18n('cancel') : 'Cancel'}</span>
        </button>
        <button id="user-logout-btn" type="button" class="user-menu-item">
          <span id="user-menu-logout-text">${i18n('sign_out') !== 'sign_out' ? i18n('sign_out') : 'Sign out'}</span>
        </button>
      </div>
    </div>

    <!-- Horizontal language strip (slides from top) -->
    <div id="language-strip" class="language-strip">
      <div class="language-strip-inner">
        <button class="language-strip-flag" data-locale="en" type="button">
          <svg class="flag-icon" width="22" height="22">
            <use href="#flag-en-square"></use>
          </svg>
        </button>
        <button class="language-strip-flag" data-locale="zh_CN" type="button">
          <svg class="flag-icon" width="22" height="22">
            <use href="#flag-cn-square"></use>
          </svg>
        </button>
      </div>
    </div>

    <div class="tts-widget-content" id="tts-widget-content">
      <!-- Voice Selection with Search -->
      <div class="voice-selector panel${voicePanelCollapsed ? ' voice-selector--collapsed' : ''}">
        <button type="button" class="voice-panel-toggle" id="voice-panel-toggle" aria-expanded="${voicePanelCollapsed ? 'false' : 'true'}" title="${voicePanelCollapsed ? i18n('expand') : i18n('minimize')}">
          <svg width="14" height="14" aria-hidden="true" class="voice-panel-toggle-icon">
            <use href="#icon-voice-panel-${voicePanelCollapsed ? 'down' : 'up'}"></use>
          </svg>
        </button>
        <div class="voice-top-grid">
          <div class="voice-field-stack">
            <label class="voice-field-label" for="voice-search" data-i18n-label="voice_controls_search_label"></label>
            <div class="dropdown-container">
              <input type="text" id="voice-search" placeholder="${i18n('voice_search_placeholder')}" autocomplete="off" />
              <button id="voice-search-clear" class="voice-search-clear" type="button" style="display: none;" title="Clear">
                <svg width="16" height="16" aria-hidden="true">
                  <use href="#icon-clear"></use>
                </svg>
              </button>
              <div id="voice-dropdown" class="dropdown-list hidden"></div>
            </div>
          </div>
          <div class="voice-field-stack voice-field-stack-speed">
            <label class="voice-field-label" for="speed-select" data-i18n-label="voice_controls_speed_label"></label>
            <select id="speed-select" class="speed-select"></select>
          </div>
        </div>

        <!-- Voice Loading Indicator -->
        <div id="voice-loading" class="voice-loading hidden">
          <div class="spinner-small"></div>
          <span>${i18n('loading_voices')}</span>
        </div>

        <!-- Options Row：开关型配置由 toggle-settings 声明表数据驱动渲染，新增开关自动出现 -->
        <div class="options-row">
          <div class="options-row-main">
            <div class="auto-detect-column" id="toggle-settings-column"></div>
          </div>
        </div>
      </div>

      <!-- API Key 未配置提示（配置统一在插件主界面完成） -->
      <div id="apikey-container" style="display: none;">
        <div class="apikey-screen panel">
          <div id="apikey-hint-text" class="apikey-hint-text">尚未配置 MiMo API Key</div>
          <div class="apikey-note">请点击浏览器工具栏的扩展图标，在插件主界面中粘贴 API Key 后即可使用朗读功能。</div>
          <a href="https://platform.xiaomimimo.com/console/api-keys" target="_blank" rel="noopener noreferrer" class="apikey-link">获取 API Key（免费）</a>
        </div>
      </div>

      <!-- Main player container (shown only for authenticated users) -->
      <div id="player-container">
        <div class="text-display">
          <div id="text-content" class="text-content" data-placeholder="${i18n('ready_to_listen')}
━━━━━━━━━━━━━━━
${i18n('paste_text_placeholder_line1')}
${i18n('then_click_play')}"></div>
        </div>
      </div>

      <!-- Player Controls：传输按钮组（播放 / 上一句 / 下一句 / 停止） -->
      <div class="player-controls">
        <button id="prev-btn" class="btn btn-secondary btn-round" disabled title="${i18n('previous_sentence')}" type="button">
          <svg class="btn-icon" width="22" height="22" aria-hidden="true">
            <use href="#icon-prev"></use>
          </svg>
        </button>
        <button id="play-pause-btn" class="btn btn-primary btn-round" disabled title="${i18n('play')}" type="button">
          <svg class="btn-icon" width="22" height="22" aria-hidden="true">
            <use href="#icon-play"></use>
          </svg>
        </button>
        <button id="next-btn" class="btn btn-secondary btn-round" disabled title="${i18n('next_sentence')}" type="button">
          <svg class="btn-icon" width="22" height="22" aria-hidden="true">
            <use href="#icon-next"></use>
          </svg>
        </button>
        <button id="stop-btn" class="btn btn-secondary btn-round" disabled title="${i18n('stop')}" type="button">
          <svg class="btn-icon" width="22" height="22" aria-hidden="true">
            <use href="#icon-stop"></use>
          </svg>
        </button>
        <button id="clear-btn" class="btn btn-danger btn-round" disabled title="${i18n('stop_and_clear')}" type="button">
          <svg class="btn-icon" width="22" height="22" aria-hidden="true">
            <use href="#icon-clear"></use>
          </svg>
        </button>
      </div>

      <!-- Status and Time Display (combined in one line) -->
      <div class="status-container">
        <span id="status-text" class="status-text">${i18n('ready')}</span>
        <span id="time-progress" class="time-progress hidden">0:00 / 0:00</span>
      </div>

      <!-- Error Message -->
      <div id="error-message" class="error-message hidden">
        <span class="error-text"></span>
        <button class="error-close-btn" id="error-close-btn" title="${i18n('close')}" type="button">
          <svg width="16" height="16" aria-hidden="true">
            <use href="#icon-clear"></use>
          </svg>
        </button>
      </div>

      <!-- Audio Element (hidden) -->
      <audio id="audio-player" preload="none"></audio>
    </div>
  `;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    /* ============================================================
       WebReader 网页悬浮窗 —— Duolingo 设计规范（DESIGN.md）
       白纸画布 · 圆角贴纸 · 2px 描边 · 单一饱和绿
       默认亮色主题；.dark-theme 为暗色变体（Night Ink 底）
       ============================================================ */

    #edge-tts-widget {
      /* Colors */
      --color-eager-green: #58cc02;
      --color-storybook-green: #d7ffb8;
      --color-spark-blue: #1cb0f6;
      --color-fresh-leaf: #a5ed6e;
      --color-night-ink: #000437;
      --color-paper-white: #ffffff;
      --color-charcoal: #4b4b4b;
      --color-pencil-gray: #777777;
      --color-faded-gray: #afafaf;
      /* 表面层 */
      --surface: var(--color-paper-white);
      --surface-card: var(--color-paper-white);
      --text-strong: var(--color-night-ink);
      --text-body: var(--color-charcoal);
      --text-muted: var(--color-pencil-gray);
      --option-hover: var(--color-storybook-green);

      /* Typography */
      --font-feather: 'Feather Bold', 'Nunito Black', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-sans: 'Nunito Sans', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

      position: fixed;
      top: 100px;
      right: 20px;
      width: 450px;
      max-height: 90vh;
      background: var(--surface);
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      z-index: 999999;
      font-family: var(--font-sans);
      font-size: 14px;
      display: flex;
      flex-direction: column;
      overflow: visible;
      color: var(--text-body);
      cursor: move;
      pointer-events: auto;
    }

    #edge-tts-widget button:not(:disabled),
    #edge-tts-widget input:not(:disabled),
    #edge-tts-widget select:not(:disabled),
    #edge-tts-widget label:has(input:not(:disabled)),
    #edge-tts-widget .btn:not(:disabled),
    #edge-tts-widget .voice-option {
      cursor: pointer;
    }

    #edge-tts-widget input:disabled,
    #edge-tts-widget select:disabled,
    #edge-tts-widget label:has(input:disabled) {
      cursor: not-allowed;
    }

    #edge-tts-widget .dropdown-list,
    #edge-tts-widget .dropdown-list * {
      cursor: default;
    }

    #edge-tts-widget .text-content {
      cursor: text;
      user-select: none;
    }

    /* ==================== 顶部头条（Storybook 绿底 + 品牌字） ==================== */

    .tts-widget-header {
      background: var(--color-paper-white);
      color: var(--color-night-ink);
      padding: 12px 16px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      border-radius: 10px 10px 0 0;
      border-bottom: 2px solid var(--color-eager-green);
      position: relative;
      z-index: 1;
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header-app-icon {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
    }

    .header-app-name {
      font-family: var(--font-feather);
      font-weight: 700;
      font-size: 21px;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: var(--color-eager-green);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .header-buttons {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    /* 头部小按钮：透明底 + 2px 描边 */
    .tts-widget-btn {
      background: transparent;
      border: 2px solid var(--color-night-ink);
      color: var(--color-night-ink);
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .tts-widget-btn svg {
      fill: var(--color-night-ink);
    }

    .tts-widget-btn:hover {
      background: var(--color-night-ink);
      color: var(--color-paper-white);
    }

    .tts-widget-btn:hover svg {
      fill: var(--color-paper-white);
    }

    .tts-widget-btn:active {
      transform: translateY(1px);
    }

    /* 语言选择按钮（国旗胶囊） */
    .language-select-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .language-button {
      background: var(--color-paper-white);
      border: 2px solid var(--color-night-ink);
      cursor: pointer;
      padding: 0;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      transition: background 0.15s ease, transform 0.1s ease;
    }

    .language-button:hover {
      background: var(--color-storybook-green);
    }

    .language-button:active {
      transform: translateY(1px);
    }

    .language-button svg.flag-icon {
      width: 22px;
      height: 22px;
      padding: 0;
      margin: 0;
    }

    .language-select-native {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 0;
      height: 0;
    }

    /* 横向语言条（从顶部滑出） */
    .language-strip {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      min-height: 64px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-paper-white);
      border-bottom: 2px solid var(--color-eager-green);
      border-radius: 12px 12px 0 0;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease-out;
      z-index: 5;
    }

    .language-strip.open {
      opacity: 1;
      pointer-events: auto;
    }

    .language-strip-inner {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      max-width: 100%;
      justify-content: center;
      align-items: center;
    }

    .language-strip-flag {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      border: 2px solid var(--color-faded-gray);
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-paper-white);
      cursor: pointer;
      transition: border-color 0.15s ease, transform 0.1s ease;
      flex: 0 0 auto;
    }

    .language-strip-flag:hover {
      border-color: var(--color-eager-green);
      transform: translateY(-1px);
    }

    .language-strip-flag:active {
      transform: scale(0.96);
    }

    .language-strip-flag svg.flag-icon {
      width: 22px;
      height: 22px;
      padding: 0;
      margin: 0;
    }

    /* ==================== 内容区 ==================== */

    .tts-widget-content {
      padding: 16px;
      overflow-y: visible;
      max-height: none;
      background: transparent;
      position: relative;
      z-index: 1;
      cursor: move;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .panel {
      background: var(--surface-card);
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      padding: 16px;
    }

    /* ==================== 音色 / 语速 / 开关 ==================== */

    .voice-selector {
      --voice-ctrl-height: 40px;
      --voice-ctrl-pad-x: 12px;
      position: relative;
    }

    .voice-panel-toggle {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 20;
      width: 26px;
      height: 26px;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      background: transparent;
      color: var(--text-muted);
      transition: color 0.15s ease, background 0.15s ease;
      pointer-events: auto;
      -webkit-appearance: none;
      appearance: none;
    }

    .voice-panel-toggle svg {
      display: block;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .voice-panel-toggle:hover {
      color: var(--color-night-ink);
      background: var(--color-storybook-green);
    }

    .voice-panel-toggle:focus-visible {
      outline: none;
    }

    .voice-selector--collapsed .voice-field-stack-speed,
    .voice-selector--collapsed .voice-loading,
    .voice-selector--collapsed .options-row {
      display: none !important;
    }

    .voice-selector--collapsed .voice-top-grid {
      flex-direction: column;
      align-items: stretch;
    }

    .voice-selector--collapsed .voice-field-stack:first-child {
      flex: none;
      width: 100%;
    }

    .voice-selector--collapsed .voice-field-stack:first-child > .voice-field-label {
      display: none !important;
    }

    .voice-selector--collapsed {
      padding: 12px;
    }

    /* 收起态：折叠按钮垂直居中到控件行右侧，输入框相应收窄避免被压住 */
    .voice-selector--collapsed .voice-panel-toggle {
      top: calc(12px + var(--voice-ctrl-height, 40px) / 2 - 13px);
      right: 6px;
    }

    .voice-selector--collapsed .voice-field-stack:first-child .dropdown-container {
      max-width: calc(100% - 30px);
    }

    .voice-top-grid {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }

    .voice-field-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .voice-field-stack:first-child {
      flex: 1;
    }

    .voice-field-stack-speed {
      flex-shrink: 0;
    }

    .voice-field-label {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.23;
      color: var(--text-muted);
      letter-spacing: 0.04em;
      padding-left: 2px;
    }

    .dropdown-container {
      position: relative;
      flex: 1;
    }

    #voice-search {
      width: 100%;
      box-sizing: border-box;
      height: var(--voice-ctrl-height, 40px);
      min-height: var(--voice-ctrl-height, 40px);
      padding: 0 32px 0 var(--voice-ctrl-pad-x, 12px);
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 14px;
      background: var(--color-paper-white);
      color: var(--text-body);
      outline: none;
      transition: border-color 0.15s ease;
    }

    #voice-search::placeholder {
      color: var(--color-faded-gray);
    }

    #voice-search:focus {
      border-color: var(--color-spark-blue);
    }

    #voice-search:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .voice-search-clear {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      width: 24px;
      height: 24px;
      z-index: 10;
      color: var(--text-muted);
    }

    .voice-search-clear svg {
      fill: currentColor;
      width: 16px;
      height: 16px;
    }

    .voice-search-clear:hover {
      background: var(--color-storybook-green);
      color: var(--color-night-ink);
    }

    .dropdown-list {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 300px;
      overflow-y: auto;
      background: var(--color-paper-white);
      border: 2px solid var(--color-night-ink);
      border-radius: 12px;
      z-index: 1000;
    }

    .dropdown-list.hidden {
      display: none;
    }

    .voice-option {
      padding: 12px;
      cursor: pointer;
      border-bottom: 2px solid var(--color-storybook-green);
      transition: background 0.12s ease;
      position: relative;
    }

    .voice-option:last-child {
      border-bottom: none;
    }

    .voice-option:hover {
      background: var(--option-hover);
    }

    .voice-option.selected {
      background: var(--color-storybook-green);
    }

    .voice-option.highlighted {
      background: var(--option-hover);
    }

    .voice-option-name {
      font-weight: 700;
      font-size: 14px;
      color: var(--text-strong);
    }

    .voice-option-details {
      font-size: 13px;
      line-height: 1.23;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* 音色加载指示 */
    .voice-loading {
      margin-top: 12px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: var(--text-strong);
      background: var(--color-storybook-green);
      border: 2px solid var(--color-eager-green);
      border-radius: 12px;
    }

    .voice-loading.hidden {
      display: none;
    }

    .spinner-small {
      width: 16px;
      height: 16px;
      border: 3px solid rgba(88, 204, 2, 0.3);
      border-top: 3px solid var(--color-eager-green);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      flex-shrink: 0;
    }

    /* Options Row（开关组） */
    .options-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    .options-row-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .auto-detect-column {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-width: 0;
      justify-content: center;
    }

    /* 复选框：圆角方块 + 2px 描边，选中绿色实心 */
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      color: var(--text-body);
      user-select: none;
      padding: 2px 0;
    }

    .checkbox-label:hover {
      color: var(--text-strong);
    }

    .checkbox-label input[type='checkbox'] {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      border: 2px solid var(--color-faded-gray);
      border-radius: 8px;
      background: var(--color-paper-white);
      position: relative;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .checkbox-label input[type='checkbox']:hover {
      border-color: var(--color-eager-green);
    }

    .checkbox-label input[type='checkbox']:checked {
      background: var(--color-eager-green);
      border-color: var(--color-eager-green);
    }

    .checkbox-label input[type='checkbox']:checked::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 1px;
      width: 5px;
      height: 10px;
      border: solid var(--color-paper-white);
      border-width: 0 3px 3px 0;
      transform: rotate(45deg);
    }

    .checkbox-label input[type='checkbox']:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .checkbox-label:has(input:disabled) {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* 语速下拉 */
    .speed-select {
      box-sizing: border-box;
      height: var(--voice-ctrl-height, 40px);
      min-height: var(--voice-ctrl-height, 40px);
      padding: 0 10px;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 700;
      background: var(--color-paper-white);
      color: var(--text-body);
      cursor: pointer;
      transition: border-color 0.15s ease;
      min-width: 92px;
      outline: none;
    }

    .speed-select option {
      background: var(--color-paper-white);
      color: var(--text-strong);
      padding: 8px;
    }

    .speed-select:focus {
      border-color: var(--color-spark-blue);
    }

    .speed-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* 语言下拉（保留方块按钮形态） */
    .language-select {
      width: 43px;
      height: 43px;
      padding: 0;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-size: 22px;
      background: var(--color-paper-white);
      color: var(--text-body);
      cursor: pointer;
      text-align: center;
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
    }

    .language-select option {
      background: var(--color-paper-white);
      color: var(--text-strong);
      padding: 8px 4px;
      font-size: 20px;
      text-align: center;
    }

    .language-select:focus {
      outline: none;
      border-color: var(--color-spark-blue);
    }

    .language-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ==================== API Key 提示界面 ==================== */

    .apikey-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
    }

    .apikey-hint-text {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--text-strong);
      line-height: 1.4;
    }

    .apikey-note {
      margin: 0;
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .apikey-link {
      color: var(--color-spark-blue);
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
    }

    .apikey-link:hover {
      text-decoration: underline;
    }

    .apikey-input {
      width: 100%;
      padding: 12px;
      border-radius: 12px;
      border: 2px solid var(--color-faded-gray);
      background: var(--color-paper-white);
      color: var(--text-body);
      font-family: var(--font-sans);
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .apikey-input:focus {
      border-color: var(--color-spark-blue);
    }

    .apikey-error {
      margin: 0;
      font-size: 12px;
      color: var(--color-night-ink);
      text-align: center;
      line-height: 1.4;
      font-weight: 700;
    }

    /* ==================== 文本显示 ==================== */

    .text-display {
      background: transparent;
      padding: 0;
    }

    .text-content {
      width: 100%;
      min-height: 200px;
      max-height: 300px;
      padding: 16px;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 15px;
      line-height: 1.6;
      background: var(--color-paper-white);
      overflow-y: auto;
      overflow-x: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      box-sizing: border-box;
      color: var(--text-body);
      display: block;
      transition: border-color 0.15s ease;
    }

    .text-content:focus-within {
      border-color: var(--color-spark-blue);
    }

    /* 空内容时缩小高度并居中占位文案 */
    .text-content:empty {
      min-height: 132px;
      max-height: 132px;
      overflow-y: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .text-content:empty::before {
      content: attr(data-placeholder);
      color: var(--color-faded-gray);
      font-style: italic;
      white-space: pre-line;
      display: block;
      text-align: center;
    }

    /* 正在朗读的高亮句：Storybook 绿底 + Night Ink 文字 */
    .text-content .highlight {
      background: var(--color-storybook-green);
      color: var(--color-night-ink);
      border-radius: 6px;
      padding: 1px 4px;
      margin: 0 1px;
    }

    /* ==================== 播放控制按钮 ==================== */

    .player-controls {
      display: flex;
      gap: 12px;
      flex-wrap: nowrap;
      justify-content: center;
      align-items: center;
      user-select: none;
      margin-bottom: 4px;
    }

    .btn {
      flex: 0 0 auto;
      width: 46px;
      height: 46px;
      padding: 0;
      border: 2px solid var(--color-faded-gray);
      background: transparent;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .btn-round {
      border-radius: 9999px;
    }

    .btn-square {
      border-radius: 12px;
    }

    .btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .btn-icon {
      width: 22px;
      height: 22px;
      fill: currentColor;
      pointer-events: none;
    }

    .btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* Primary CTA：实心绿 + 白字（颜色本身即按钮） */
    .btn-primary {
      background: var(--color-eager-green);
      border-color: var(--color-eager-green);
      color: var(--color-paper-white);
    }

    .btn-primary:hover:not(:disabled) {
      filter: brightness(1.07);
    }

    /* Outlined：透明底 + 2px 描边 + Spark Blue 图标 */
    .btn-secondary {
      border-color: var(--color-faded-gray);
      color: var(--color-spark-blue);
    }

    .btn-secondary:hover:not(:disabled) {
      border-color: var(--color-spark-blue);
      background: rgba(28, 176, 246, 0.1);
    }

    /* 整页朗读：绿色描边（progress / go 语义） */
    .btn-success {
      border-color: var(--color-eager-green);
      color: var(--color-eager-green);
    }

    .btn-success:hover:not(:disabled) {
      background: var(--color-storybook-green);
    }

    /* 停止清空：Night Ink 深色强调（危险操作的深色警示） */
    .btn-danger {
      border-color: var(--color-night-ink);
      color: var(--color-night-ink);
    }

    .btn-danger:hover:not(:disabled) {
      background: rgba(0, 4, 55, 0.08);
    }

    /* 停止清空与传输组分隔：圆点变体 + 左侧自动间距 */
    #clear-btn {
      margin-left: 8px;
    }

    /* ==================== 状态与错误 ==================== */

    .status-container {
      text-align: center;
      min-height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      cursor: move;
    }

    .status-text {
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.23;
    }

    .time-progress {
      color: var(--color-spark-blue);
      font-size: 13px;
      font-weight: 700;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      letter-spacing: 0.5px;
    }

    .time-progress.hidden {
      display: none;
    }

    .error-message {
      padding: 12px;
      background: var(--color-paper-white);
      border: 2px solid var(--color-night-ink);
      border-radius: 12px;
      color: var(--color-night-ink);
      font-size: 13px;
      line-height: 1.5;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      position: relative;
    }

    .error-message.warning {
      border-color: var(--color-night-ink);
      color: var(--color-night-ink);
    }

    .warning-button-preview {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .warning-button-preview .btn-preview {
      transform: scale(0.85);
    }

    .error-text {
      flex: 1;
      word-wrap: break-word;
      line-height: 1.5;
    }

    .error-close-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      color: var(--color-night-ink);
      width: 24px;
      height: 24px;
    }

    .error-close-btn svg {
      fill: currentColor;
      width: 16px;
      height: 16px;
    }

    .error-close-btn:hover {
      background: rgba(0, 4, 55, 0.1);
    }

    .error-message.hidden {
      display: none;
    }

    /* ==================== 滚动条 ==================== */

    .dropdown-list::-webkit-scrollbar,
    .text-content::-webkit-scrollbar {
      width: 8px;
    }

    .dropdown-list::-webkit-scrollbar-track,
    .text-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .dropdown-list::-webkit-scrollbar-thumb,
    .text-content::-webkit-scrollbar-thumb {
      background: var(--color-faded-gray);
      border-radius: 4px;
    }

    .dropdown-list::-webkit-scrollbar-thumb:hover,
    .text-content::-webkit-scrollbar-thumb:hover {
      background: var(--color-pencil-gray);
    }

    /* ==================== 用户菜单（覆盖层） ==================== */

    .user-menu-button {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid var(--color-night-ink);
      background: var(--color-eager-green);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: var(--color-paper-white);
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .user-menu-button.hidden {
      display: none;
    }

    .user-avatar-initial {
      pointer-events: none;
    }

    .user-avatar-img {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      object-fit: cover;
      pointer-events: none;
    }

    .user-avatar-img.hidden {
      display: none;
    }

    .user-menu {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--color-paper-white);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 9999;
      pointer-events: auto;
    }

    .user-menu.hidden {
      display: none;
    }

    .user-menu-email {
      color: var(--text-muted);
      font-size: 13px;
      text-align: center;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-menu-actions {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .user-menu-item {
      padding: 10px 24px;
      background: var(--color-eager-green);
      border: 2px solid var(--color-eager-green);
      border-radius: 12px;
      color: var(--color-paper-white);
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      pointer-events: auto;
    }

    .user-menu-item:hover {
      filter: brightness(1.07);
    }

    .user-menu-cancel-btn {
      padding: 10px 24px;
      background: transparent;
      border: 2px solid var(--color-faded-gray);
      border-radius: 12px;
      color: var(--color-spark-blue);
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      pointer-events: auto;
    }

    .user-menu-cancel-btn:hover {
      border-color: var(--color-spark-blue);
    }

    /* ==================== 精简模式（上中下三层并为两层） ==================== */

    #edge-tts-widget.minimized {
      width: 300px;
    }

    /* 隐藏头部、音色面板、文本框、错误条 */
    #edge-tts-widget.minimized .tts-widget-header,
    #edge-tts-widget.minimized #tts-widget-content .voice-selector,
    #edge-tts-widget.minimized .text-display,
    #edge-tts-widget.minimized .error-message,
    #edge-tts-widget.minimized #apikey-container {
      display: none !important;
    }

    /* 精简态宽度只够传输组 + 恢复按钮：停止清空收起（停止仍保留） */
    #edge-tts-widget.minimized #clear-btn {
      display: none !important;
    }

    #edge-tts-widget.minimized .tts-widget-content {
      padding: 12px;
      gap: 8px;
    }

    /* 恢复按钮挪进播放控制行后靠右，与播放按钮分组 */
    #edge-tts-widget.minimized .player-controls .tts-widget-minimize {
      margin-left: auto;
    }

    /* ==================== 未配置 API Key 的精简形态 ==================== */

    #edge-tts-widget.auth-mode {
      width: 320px !important;
    }

    #edge-tts-widget.auth-mode #tts-widget-content .voice-selector,
    #edge-tts-widget.auth-mode #player-container,
    #edge-tts-widget.auth-mode .player-controls,
    #edge-tts-widget.auth-mode .status-container,
    #edge-tts-widget.auth-mode #error-message,
    #edge-tts-widget.auth-mode .tts-widget-minimize,
    #edge-tts-widget.auth-mode .tts-widget-theme-toggle {
      display: none !important;
    }

    /* ==================== 暗色变体（Night Ink 底，默认不启用） ==================== */

    #edge-tts-widget.dark-theme {
      --surface: #000437;
      --surface-card: rgba(255, 255, 255, 0.07);
      --text-strong: #ffffff;
      --text-body: #afafaf;
      --text-muted: #afafaf;
      --option-hover: rgba(215, 255, 184, 0.18);
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .tts-widget-header {
      background: rgba(255, 255, 255, 0.06);
      border-bottom-color: var(--color-eager-green);
    }

    #edge-tts-widget.dark-theme .header-app-name {
      color: var(--color-fresh-leaf);
    }

    #edge-tts-widget.dark-theme .tts-widget-btn {
      border-color: rgba(255, 255, 255, 0.55);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .tts-widget-btn svg {
      fill: #ffffff;
    }

    #edge-tts-widget.dark-theme .tts-widget-btn:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .tts-widget-btn:hover svg {
      fill: #ffffff;
    }

    #edge-tts-widget.dark-theme .language-button,
    #edge-tts-widget.dark-theme .language-strip-flag {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.45);
    }

    #edge-tts-widget.dark-theme .language-strip {
      background: #000437;
    }

    #edge-tts-widget.dark-theme #voice-search,
    #edge-tts-widget.dark-theme .speed-select,
    #edge-tts-widget.dark-theme .language-select,
    #edge-tts-widget.dark-theme .text-content,
    #edge-tts-widget.dark-theme .apikey-input {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme #voice-search::placeholder {
      color: rgba(175, 175, 175, 0.7);
    }

    #edge-tts-widget.dark-theme .dropdown-list {
      background: #0a0a45;
      border-color: rgba(255, 255, 255, 0.45);
    }

    #edge-tts-widget.dark-theme .voice-option {
      border-bottom-color: rgba(255, 255, 255, 0.14);
    }

    #edge-tts-widget.dark-theme .voice-option-name {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .voice-option-details {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-loading {
      background: rgba(215, 255, 184, 0.14);
      color: #d7ffb8;
    }

    #edge-tts-widget.dark-theme .text-content .highlight {
      background: rgba(88, 204, 2, 0.32);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .text-content:empty::before {
      color: rgba(175, 175, 175, 0.6);
    }

    #edge-tts-widget.dark-theme .btn-secondary {
      color: var(--color-spark-blue);
    }

    #edge-tts-widget.dark-theme .btn-secondary:hover:not(:disabled) {
      background: rgba(28, 176, 246, 0.16);
    }

    #edge-tts-widget.dark-theme .btn-success {
      color: #a5ed6e;
    }

    #edge-tts-widget.dark-theme .btn-success:hover:not(:disabled) {
      background: rgba(88, 204, 2, 0.16);
    }

    #edge-tts-widget.dark-theme .btn-danger {
      border-color: rgba(255, 255, 255, 0.55);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .btn-danger:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
    }

    #edge-tts-widget.dark-theme .error-message {
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.55);
    }

    #edge-tts-widget.dark-theme .error-message.warning {
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.55);
    }

    #edge-tts-widget.dark-theme .error-close-btn {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .user-menu {
      background: #000437;
    }

    #edge-tts-widget.dark-theme .status-text {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-panel-toggle {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-panel-toggle:hover {
      background: rgba(215, 255, 184, 0.16);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .voice-search-clear {
      color: #afafaf;
    }

    #edge-tts-widget.dark-theme .voice-search-clear:hover {
      background: rgba(215, 255, 184, 0.16);
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .checkbox-label {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .checkbox-label input[type='checkbox'] {
      background: rgba(255, 255, 255, 0.08);
    }

    #edge-tts-widget.dark-theme .apikey-hint-text {
      color: #ffffff;
    }

    #edge-tts-widget.dark-theme .user-menu-email {
      color: #afafaf;
    }

    #edge-tts-widget.dragging {
      opacity: 0.85;
    }

    /* ==================== Tooltip ==================== */

    .tts-tooltip {
      position: absolute;
      background: var(--color-night-ink);
      color: var(--color-paper-white);
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 13px;
      pointer-events: none;
      z-index: 10000001;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .tts-tooltip.show {
      opacity: 1;
    }

    #edge-tts-widget.dark-theme .tts-tooltip {
      background: rgba(255, 255, 255, 0.94);
      color: #000437;
    }

    /* ==================== 动画 ==================== */

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  `;

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
