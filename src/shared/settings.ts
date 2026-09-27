/**
 * 设置持久化（共享层）：chrome.storage.local 优先，不可用时回退 localStorage。
 * 各层的 saveSettings/loadStoredSettings 只负责收集/应用状态与同步 DOM。
 */
import type { ExtensionSettings, TtsProvider } from './types';
import { LOCAL_STORAGE_SETTINGS_KEY } from './types';
import { DEFAULT_TTS_PROVIDER, INTERFACE_THEME_STORAGE, TTS_PROVIDER_STORAGE } from './constants';
import { limitFloat } from './utils';
import { TOGGLE_KEYS } from './toggle-settings';

const SETTING_KEYS = [
  'selectedVoice',
  'voiceSelectionIsManual',
  'playbackSpeed',
  'voicePanelControlsCollapsed',
  'ttsProvider',
  'relayUrl',
  ...TOGGLE_KEYS,
] as const;

/** 持久化设置 */
export function persistSettings(settings: ExtensionSettings): void {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set(settings);
  } else {
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  }
}

/** 读取设置（存储中不存在时返回空对象，由调用方按默认值处理） */
export function readSettings(): Promise<Partial<ExtensionSettings>> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([...SETTING_KEYS], (data) => {
        resolve(data as Partial<ExtensionSettings>);
      });
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      resolve(stored ? JSON.parse(stored) : {});
    }
  });
}

/** 读取当前 TTS provider（storage 缺失或非法值时回退默认 mimo，保证既有行为不变） */
export function readTtsProvider(): Promise<TtsProvider> {
  return new Promise<TtsProvider>((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(DEFAULT_TTS_PROVIDER);
      return;
    }
    chrome.storage.local.get(TTS_PROVIDER_STORAGE, (data) => {
      const raw = data && data[TTS_PROVIDER_STORAGE];
      resolve(raw === 'relay' ? 'relay' : 'mimo');
    });
  });
}

/** 写入 TTS provider（切换时落盘，background / popup 共用） */
export function setProvider(provider: TtsProvider): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      localStorage.setItem(TTS_PROVIDER_STORAGE, provider);
      resolve();
      return;
    }
    chrome.storage.local.set({ [TTS_PROVIDER_STORAGE]: provider }, () => resolve());
  });
}

/**
 * 界面主题（亮 / 暗）：与界面语言同级，popup 主页与网页悬浮窗共用同一份。
 *
 * 主题切换只在 popup 主页标题栏（悬浮窗不再单独提供入口），写回后由各层
 * 的存储变更监听即时应用，避免两层界面不一致。
 */
export function readInterfaceTheme(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(localStorage.getItem(INTERFACE_THEME_STORAGE) === 'dark');
      return;
    }
    chrome.storage.local.get(INTERFACE_THEME_STORAGE, (data) => {
      resolve(!!(data && data[INTERFACE_THEME_STORAGE] === 'dark'));
    });
  });
}

/** 写入界面主题（dark=true 暗色，false 亮色） */
export function writeInterfaceTheme(dark: boolean): void {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    localStorage.setItem(INTERFACE_THEME_STORAGE, dark ? 'dark' : 'light');
    return;
  }
  chrome.storage.local.set({ [INTERFACE_THEME_STORAGE]: dark ? 'dark' : 'light' });
}

/** 语速档位：0.5x–2.5x，步长 0.1（UI 动态生成 option 用）。
 * 各引擎对 0.1 步长的支持情况：本地 speechSynthesis（rate 连续 float）与
 * Edge 中转（百分比精确映射）完全支持；MiMo 为风格指令近似控制，小步长听感无差异。
 */
const SPEED_MIN = 0.5;
const SPEED_MAX = 2.5;
const SPEED_STEP = 0.1;

/** 语速格式化为 option 值（一位小数，如 "1.1"），避免浮点误差进 DOM */
function formatSpeedValue(speed: number): string {
  return (Math.round(speed * 10) / 10).toFixed(1);
}

/** 按常量档位生成 0.5–2.5 步长 0.1 的 option 列表并填入 select（幂等，可重复调用） */
export function populateSpeedOptions(selectEl: HTMLSelectElement): void {
  selectEl.options.length = 0;
  for (let speed = SPEED_MIN; speed <= SPEED_MAX + 1e-9; speed += SPEED_STEP) {
    const value = formatSpeedValue(speed);
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `${value}x`;
    selectEl.appendChild(option);
  }
}

/** 将存储中的数值语速匹配到 <option> 值（如 2 → "2.0"），返回实际生效语速 */
export function syncSpeedSelectFromStored(selectEl: HTMLSelectElement | null, storedSpeed: unknown): number {
  if (!selectEl) return 1.0;
  if (storedSpeed === undefined || storedSpeed === null || storedSpeed === '') {
    selectEl.value = '1.0';
    return 1.0;
  }
  const n = Number(storedSpeed);
  if (Number.isNaN(n)) {
    selectEl.value = '1.0';
    return 1.0;
  }
  // 防御性钳制：存储值可能被外部改写，先归到合法语速区间再匹配界面档位
  const clamped = limitFloat(n, SPEED_MIN, SPEED_MAX);
  // 按最近档位吸附（0.1 步长），任意历史存储值都能落到合法 option
  const stepped = formatSpeedValue(Math.round((clamped - SPEED_MIN) / SPEED_STEP) * SPEED_STEP + SPEED_MIN);
  selectEl.value = stepped;
  return parseFloat(stepped);
}
