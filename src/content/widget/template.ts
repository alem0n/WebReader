/**
 * 悬浮窗 HTML 结构模板。
 *
 * 从 widget.ts 拆出（docs/tech-debt.md TD-001）：结构模板与创建流程分离。
 * 文案经 i18n 插值；音色面板折叠态影响初始 class 与图标方向。
 * SVG 精灵拼接在模板最前（与拆分前的 innerHTML 完全一致）。
 */
import { i18n } from '../i18n';
import { WIDGET_ICON_SPRITES } from './icons';

export function buildWidgetHTML(voicePanelCollapsed: boolean): string {
  return (
    WIDGET_ICON_SPRITES +
    `<div class="tts-widget-header" id="tts-widget-header">
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
  `
  );
}
