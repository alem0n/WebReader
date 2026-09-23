/** background 消息通信封装（popup / content 侧使用） */
import type { BackgroundMessage, BackgroundResponse } from './types';

/** 发送消息到 background service worker，返回 Promise */
export function sendToBackground<T extends BackgroundResponse = any>(message: BackgroundMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
