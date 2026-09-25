/** 播放时间进度展示：已用时间 / 估算总时长 */
import { getWidgetElementById } from '../widget';
import { state } from '../state';

function formatTime(seconds: any) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function estimateTotalDuration(text: string, speed: number) {
  const words = text.split(/\s+/).length;
  const baseWPM = 150; // words per minute
  const minutes = words / baseWPM;
  return (minutes * 60) / speed; // seconds
}

export function updateTimeProgress(currentTime: any, _duration: any) {
  const timeProgressEl = getWidgetElementById('time-progress') as any;
  if (!timeProgressEl) return;

  if (state.sentencePlayer && state.sentencePlayer.isPlaying) {
    // Calculate total elapsed time (previous chunks + current position)
    const totalCurrentTime = state.totalElapsedTime + currentTime;

    // Estimate total duration for all sentences
    const allText = state.sentencePlayer.sentences.join(' ');
    const totalDuration = estimateTotalDuration(allText, state.playbackSpeed);

    const currentFormatted = formatTime(totalCurrentTime);
    const durationFormatted = formatTime(totalDuration);
    timeProgressEl.textContent = `${currentFormatted} / ${durationFormatted}`;
    timeProgressEl.classList.remove('hidden');
  } else {
    timeProgressEl.classList.add('hidden');
  }
}
