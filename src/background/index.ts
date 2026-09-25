/**
 * Background service worker - MiMo TTS 代理
 * 移除了原版的 Google OAuth 登录、认证检查、登出、统计上报、卸载/重装追踪、SSE 流式传输。
 * 仅代理 MiMo TTS 合成请求、API Key 管理、预置音色与语言文件加载。
 */
import type {
  BackgroundResponse,
  I18nMessagesResponse,
  PresetVoicesResponse,
  RelayConfigResponse,
  SaveApiKeyResponse,
  ToggleWidgetResponse,
} from '../shared/types';
import { checkApiKeyStatus, saveApiKey } from './api-key';
import { handleTTSSpeech, type TtsSpeechRequest } from './tts';
import { handleRelayTTS, type RelaySpeechRequest } from './relay-tts';
import { checkRelayStatus, saveRelayConfig } from './relay-config';
import { resolveProvider, setProvider } from './provider';
import { loadI18nMessagesForLocale } from './i18n';
import { sendToTab } from './msg';
import { ensureContextMenu, setupContextMenuHandler } from './context-menu';
import { getVoiceProviderOrFallback } from './voices';

/** 切换当前活动标签页中的悬浮窗（由 popup 主界面按钮触发） */
function toggleWidgetOnActiveTab(sendResponse: (response: ToggleWidgetResponse) => void): void {
  void sendToTab({ action: 'toggle' }, sendResponse);
}

/** 朗读当前活动标签页整页正文（由 popup「阅读整页」按钮触发，转发给 content） */
function readEntirePageOnActiveTab(sendResponse: (response: ToggleWidgetResponse) => void): void {
  void sendToTab({ action: 'readEntirePage' }, sendResponse);
}

/** 朗读一段文本（由 popup「从剪贴板粘贴」按钮触发，文本在 popup 侧已读入） */
function playTextOnActiveTab(text: string, sendResponse: (response: ToggleWidgetResponse) => void): void {
  void sendToTab({ action: 'playSelectedText', text }, sendResponse);
}

/** 保存 API Key 成功后，通知当前活动标签的页面悬浮窗：可从 Key 界面切回播放器了 */
function broadcastApiKeySaved(): void {
  void sendToTab({ action: 'apiKeySaved' });
}

/** 后端配置变更后，通知页面悬浮窗刷新音色缓存（provider 切换 / 地址变更都走这里） */
function broadcastRelayConfigSaved(): void {
  void sendToTab({ action: 'relayConfigSaved' });
}

// 点击图标已改为直接打开 popup 主界面（manifest default_popup），
// 不再使用 chrome.tabs.create 打开任何新网页标签。

// 右键菜单「朗读选中文字」：安装时与 Service Worker 启动时各创建一次，
// 并注册点击路由（点击 → sendToTab → content 的 playSelectedText，content 零新开发）
chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});
ensureContextMenu();
setupContextMenuHandler();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.action) {
    case 'ttsSpeech': {
      // provider 路由：由 background 从存储读取，单一事实源；消息体形状不变
      void resolveProvider().then((provider) => {
        if (provider === 'relay') {
          handleRelayTTS(request as RelaySpeechRequest, sendResponse as (r: BackgroundResponse) => void);
        } else {
          handleTTSSpeech(request as TtsSpeechRequest, sendResponse as (r: BackgroundResponse) => void);
        }
      });
      return true; // async
    }

    case 'toggleWidgetOnActiveTab':
      toggleWidgetOnActiveTab(sendResponse as (r: ToggleWidgetResponse) => void);
      return true; // async

    case 'checkApiKeyStatus':
      checkApiKeyStatus(sendResponse as (r: BackgroundResponse) => void);
      return true; // async

    case 'saveApiKey':
      saveApiKey(request.apiKey as string, (response: SaveApiKeyResponse) => {
        sendResponse(response);
        if (response.success) broadcastApiKeySaved();
      });
      return true; // async

    case 'getPresetVoices': {
      // 音色目录同样按 provider 路由：由各引擎的 VoiceProvider 提供选项
      // （MiMo 本地常量 / relay 后端拉取），消息处理器只做派发
      void resolveProvider().then(async (provider) => {
        const voiceProvider = getVoiceProviderOrFallback(provider);
        const result = await voiceProvider.getVoices();
        if ('voices' in result) {
          sendResponse({ success: true, voices: result.voices } as PresetVoicesResponse);
        } else {
          sendResponse({ success: false, error: result.error } as PresetVoicesResponse);
        }
      });
      return true; // async
    }

    case 'loadI18nMessages':
      loadI18nMessagesForLocale(request.locale as string, sendResponse as (r: I18nMessagesResponse) => void);
      return true; // Keep the message channel open for async response

    case 'saveRelayConfig': {
      void saveRelayConfig(request.url as string, request.token as string | undefined).then((response) => {
        sendResponse(response as RelayConfigResponse);
        if (response.success) broadcastRelayConfigSaved();
      });
      return true; // async
    }

    case 'checkRelayStatus':
      void checkRelayStatus().then((response) => {
        sendResponse(response as RelayConfigResponse);
      });
      return true; // async

    case 'switchProvider': {
      // popup 切换引擎后通知 background 落盘并广播 content 刷新音色缓存
      void setProvider(request.provider === 'relay' ? 'relay' : 'mimo').then(() => {
        sendResponse({ success: true } as RelayConfigResponse);
        broadcastRelayConfigSaved();
      });
      return true; // async
    }

    case 'readEntirePageOnActiveTab':
      readEntirePageOnActiveTab(sendResponse as (r: ToggleWidgetResponse) => void);
      return true; // async

    case 'playTextOnActiveTab':
      playTextOnActiveTab(request.text as string, sendResponse as (r: ToggleWidgetResponse) => void);
      return true; // async

    default:
      return false;
  }
});
