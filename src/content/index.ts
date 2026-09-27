/**
 * content script entry.
 *
 * 原始 content.js 的 initWidget 是约 4000 行的巨型闭包；内部函数/类已拆到
 * voices / player / ui / settings 等模块。本文件只保留：
 *   1) 初始化编排顺序（各步骤按域拆到 widget-init/ 子目录）
 *   2) 模块级注册（background 消息、页面点击跳转、划词监听、widget 初始化钩子）
 *
 * 初始化顺序是隐性契约：必须「挂载 → 填充 state → 绑定 → 加载」，
 * state 的 DOM 引用在 initWidget 之后才非空（AGENTS.md §7）。
 */
import { state } from './state';
import { logger } from './log';
import { loadInterfaceLanguage, applyInterfaceLanguage } from './i18n';
import { injectSelectionButtonStyles } from './selection';
import { playSelectedText } from './text-input';
import { initPageFab } from './page-fab';
import { getWidget, setWidgetInitializer } from './widget';
import { populateSpeedOptions } from '../shared/settings';
import { loadStoredSettings } from './settings';
import { renderToggleSettings } from './toggle-settings';
import { loadVoices } from './voices';
import { playEntirePage } from './player';
import { dragStart, drag, dragEnd } from './ui';

import { registerBackgroundMessages } from './background-messages';
import { registerClickJumpListener, registerSelectionListener } from './page-listeners';
import { registerStorageSync } from './storage-sync';
import { fillWidgetDomRefs } from './widget-init/dom-refs';
import { bindUserMenuNoOps, initAuthScreen, installWidgetShowLoginBridge } from './widget-init/auth-screen';
import { initWidgetStateDefaults, initAudioPlayer } from './widget-init/audio-player';
import { initMinimize } from './widget-init/theme';
import { installGlobalBridge } from './widget-init/global-bridge';
import { bindVoiceSearch } from './widget-init/voice-search';
import { bindVoicePanelAndSpeed, bindPlayerControls } from './widget-init/controls';

declare global {
  interface Window {
    edgeTTSShowWidgetLogin?: () => void;
    edgeTTSRefreshVoiceLabels?: () => void;
    edgeTTSUpdatePlayButton?: () => void;
    edgeTTSGetSelectedVoice?: () => any;
    edgeTTSStopPlayback?: () => void;
    playSelectedText?: (text: string) => void;
    playEntirePage?: () => Promise<void>;
    ttsWidgetShadowRoot?: ShadowRoot | null;
  }
}

// Inject selection button styles on load (kept for compatibility; real styles live in Shadow DOM)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectSelectionButtonStyles);
} else {
  injectSelectionButtonStyles();
}

// 页面内「朗读整页」悬浮按钮：有正文时自动出现在右下角，点击直接识别并朗读
initPageFab();

// background → content 消息监听（模块级，注册一次）
registerBackgroundMessages();

// 网页内点击跳转 + 划词选择监听（模块级，注册一次）
registerClickJumpListener();
registerSelectionListener();

// 主页（popup）改了界面语言 / 主题时，已打开的悬浮窗即时跟随（模块级，注册一次）
registerStorageSync();

// 暴露给外部（popup / background 注入脚本）调用：朗读整页
window.playEntirePage = playEntirePage;

export async function initWidget(widgetElement: HTMLElement | null): Promise<void> {
  // Load interface language first
  await loadInterfaceLanguage();

  const widget = widgetElement || getWidget();
  if (!widget) return;
  const root: any = widget.getRootNode() instanceof ShadowRoot ? widget.getRootNode() : document;
  const rootGetById = (id: string): any => (root.getElementById ? root.getElementById(id) : document.getElementById(id));

  // 1) 挂载完成 → 填充 state 的 DOM 引用（后续步骤全部依赖这一步）
  fillWidgetDomRefs(rootGetById);

  // 2) 界面语言：由主页统一配置，此处只把存储中的语言应用到 widget
  applyInterfaceLanguage(state.interfaceLanguage);

  // 3) 认证界面（登录已移除，用户菜单为 no-op；无 Key 且无本地音色才引导配 Key）
  bindUserMenuNoOps();
  await initAuthScreen();
  installWidgetShowLoginBridge();

  // 4) 状态默认值（含 SentencePlayer 与拖拽 / 提示状态初值）
  initWidgetStateDefaults();

  // 5) 窗口行为：拖拽、关闭、收起（主题由主页统一配置，创建时已按存储打好 dark-theme 类）
  widget.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  state.closeBtn!.addEventListener('click', () => {
    widget.style.display = 'none';
  });
  initMinimize(widget);

  // 6) 全局桥接（保留 edgeTTS* 旧名字供外部脚本调用）
  installGlobalBridge();

  // 7) 播放器（WebAudioPlayer，绕过页面 CSP 对 blob 媒体的拦截）
  initAudioPlayer();

  // 8) 音色搜索框与下拉（含键盘导航与点击外部收起）
  bindVoiceSearch(rootGetById);

  // 9) 音色面板折叠 + 语速选择
  bindVoicePanelAndSpeed(widget, rootGetById);

  // 10) 播放控制按钮 + 错误关闭（界面语言切换入口在主页，由 storage-sync 同步）
  bindPlayerControls();

  // 11) 读取存储设置并加载音色（开关表在读取存储之后渲染，勾选状态才与存储一致）
  await loadInitialSettings(rootGetById);

  // 12) 暴露给外部的文本入口
  window.playSelectedText = playSelectedText;
}

/** 读取存储设置、渲染开关、加载音色目录（initWidget 末尾调用） */
async function loadInitialSettings(rootGetById: (id: string) => any): Promise<void> {
  // Set default speed（0.1 步长档位动态生成，见 shared/settings）
  if (state.speedSelect) {
    populateSpeedOptions(state.speedSelect);
    state.speedSelect.value = '1.0';
  }

  await loadStoredSettings();
  // 开关型配置由声明表数据驱动渲染（在读取存储之后，勾选与可用状态才与存储一致）
  renderToggleSettings(rootGetById('toggle-settings-column'));
  await loadVoices();
  logger.debug('initWidget sequence done');
}

// 注册 widget 初始化钩子（在此处而非 widget.ts 内调用，以打破循环依赖）
setWidgetInitializer(initWidget);
