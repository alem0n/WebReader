/**
 * Edge 音色目录：启动拉取 + TTL 刷新（同样需要令牌与 muid，实测可用）。
 *
 * 权威端点返回的 schema 较简（ShortName / Locale / Gender）；
 * 转成扩展侧已有的 PresetVoice 形状（name = ShortName，界面侧的
 * formatVoiceDisplayName 本就按 xx-XX-NameNeural 规范解析，零改动渲染）。
 */
import { EDGE_ORIGIN, EDGE_USER_AGENT, type EdgeEndpoints } from './constants';

/** Edge 音色列表接口的原始条目 */
export interface EdgeVoiceListEntry {
  Name: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  LocaleName?: string;
  FriendlyName?: string;
  Status?: string;
  VoiceTag?: {
    ContentCategories?: string[];
    VoicePersonalities?: string[];
  };
}

/** 对外暴露的音色条目（与扩展侧 PresetVoice 同形状） */
export interface VoiceCatalogEntry {
  /** 显示名（ShortName，如 zh-CN-XiaoxiaoNeural） */
  name: string;
  /** 传给 SSML 的 voice 名（同 ShortName） */
  voice: string;
  /** 语言代码，如 zh-CN / en-US */
  language: string;
  /** 性别：Male / Female */
  gender: string;
}

function generateMuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

export class VoiceCatalog {
  private entries: VoiceCatalogEntry[] = [];
  private fetchedAt = 0;
  private inflight: Promise<VoiceCatalogEntry[]> | null = null;

  constructor(
    private readonly endpoints: EdgeEndpoints,
    private readonly trustedClientToken: string,
    private readonly ttlMs = 24 * 60 * 60 * 1000
  ) {}

  /** 取音色目录：缓存有效则直接返回，否则后台拉取 */
  async list(): Promise<VoiceCatalogEntry[]> {
    if (this.entries.length > 0 && Date.now() - this.fetchedAt < this.ttlMs) {
      return this.entries;
    }
    if (!this.inflight) {
      this.inflight = this.fetch().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  /** 强制刷新（供 /v1/health 探活时顺带刷新） */
  async refresh(): Promise<VoiceCatalogEntry[]> {
    this.fetchedAt = 0;
    return this.list();
  }

  /** 从上游拉取音色列表（需要令牌与 muid，与合成链路同源） */
  private async fetch(): Promise<VoiceCatalogEntry[]> {
    const authParam =
      this.endpoints.paramStyle === 'msedgeservices'
        ? `Ocp-Apim-Subscription-Key=${this.trustedClientToken}`
        : `trustedclienttoken=${this.trustedClientToken}`;

    const url = `${this.endpoints.voicesUrl}?${authParam}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': EDGE_USER_AGENT,
        Origin: EDGE_ORIGIN,
        Cookie: `muid=${generateMuid()};`,
      },
    });

    if (!response.ok) {
      throw new Error(`Edge voices list HTTP ${response.status}`);
    }

    const raw = (await response.json()) as EdgeVoiceListEntry[];
    if (!Array.isArray(raw)) {
      throw new Error('Edge voices list: response is not an array');
    }

    this.entries = raw
      .filter((entry) => entry && entry.ShortName && entry.Locale)
      .map((entry) => ({
        name: entry.ShortName,
        voice: entry.ShortName,
        language: entry.Locale,
        gender: entry.Gender,
      }));
    this.fetchedAt = Date.now();
    return this.entries;
  }
}
