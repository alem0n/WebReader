/**
 * 悬浮窗 SVG 图标精灵（UI 图标 + 国旗方块），纯静态资源，无插值。
 *
 * 从 widget.ts 拆出（docs/tech-debt.md TD-001）：图标定义与悬浮窗装配逻辑分离，
 * 改图标只动本文件，不影响创建流程。
 */
export const WIDGET_ICON_SPRITES = `
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

    `;
