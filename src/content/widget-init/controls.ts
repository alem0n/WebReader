/**
 * 播放控制按钮、音色面板折叠与语速选择的绑定。
 *
 * 播放/停止/清除/上下句的实际处理在 player 模块；此处只做事件绑定。
 * 音色面板折叠状态由 .voice-selector--collapsed 类驱动，语速变更写回存储。
 */
import { state } from '../state';
import { logger } from '../log';
import { setVoicePanelCollapsed, hideError } from '../ui';
import { saveSettings } from '../settings';
import { handlePlayPause, handleStop, handleClear, handlePrev, handleNext } from '../player';

/** 音色面板折叠按钮 + 语速选择（rootGetById 用于 Shadow DOM 内取值） */
export function bindVoicePanelAndSpeed(widget: HTMLElement, rootGetById: (id: string) => any): void {
  state.voiceSelectorEl = widget.querySelector('.voice-selector') as any;
  state.voicePanelToggle = rootGetById('voice-panel-toggle');
  if (state.voicePanelToggle && state.voiceSelectorEl) {
    state.voicePanelToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextCollapsed = !state.voiceSelectorEl!.classList.contains('voice-selector--collapsed');
      setVoicePanelCollapsed(nextCollapsed);
    });
  }

  // Speed control
  state.speedSelect!.addEventListener('change', (e) => {
    state.playbackSpeed = parseFloat((e.target as any).value);
    logger.debug('Speed changed to:', state.playbackSpeed);
    saveSettings();
  });
}

/** 播放控制按钮 + 错误关闭按钮 */
export function bindPlayerControls(): void {
  state.playPauseBtn!.addEventListener('click', handlePlayPause);
  state.stopBtn!.addEventListener('click', handleStop);
  state.clearBtn!.addEventListener('click', handleClear);
  state.prevBtn!.addEventListener('click', handlePrev);
  state.nextBtn!.addEventListener('click', handleNext);

  // Error close button
  if (state.errorCloseBtn) {
    state.errorCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideError();
    });
  }
}
