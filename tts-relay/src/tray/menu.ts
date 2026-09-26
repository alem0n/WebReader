/**
 * 托盘右键菜单：结构一次性建好（稳定 __id，供 systray2 回指点击项），
 * 状态变化时只就地改标题 / 勾选 / 可用性，再整体 update-menu。
 *
 * 菜单项通过自定义 id 字段携带命令（systray2 的 MenuItem 不含此字段，
 * 点击回调拿到的内部对象保留了原始引用，故 id 可读）。
 */
import type { Menu, MenuItem } from 'systray2';
import type { RuntimeState } from '../runtime/relay-runtime';
import type { RelayConfig } from '../config';
import { trayIcon } from './icons';

export type CommandMenuItem = MenuItem & { id?: string; __id?: number };

export const COMMAND = {
  toggleListen: 'toggle-listen',
  hostLocal: 'host:127.0.0.1',
  hostLan: 'host:0.0.0.0',
  openBrowser: 'open-browser',
  copyAddress: 'copy-address',
  reloadConfig: 'reload-config',
  exit: 'exit',
} as const;

/** 端口快捷项（任意端口请编辑配置文件后「重新加载配置」） */
export const PORT_CHOICES = [8787, 8000, 8080, 8800, 3000, 5000, 9000, 7878];

export const HOST_CHOICES: { value: string; title: string; id: string }[] = [
  { value: '127.0.0.1', title: '仅本机（127.0.0.1）', id: COMMAND.hostLocal },
  { value: '0.0.0.0', title: '允许局域网（0.0.0.0）', id: COMMAND.hostLan },
];

export const ENDPOINT_CHOICES: { value: 'bing' | 'msedgeservices'; title: string; id: string }[] = [
  { value: 'bing', title: 'bing（默认 / 权威）', id: 'endpoint:bing' },
  { value: 'msedgeservices', title: 'msedgeservices（备选）', id: 'endpoint:msedgeservices' },
];

export interface MenuContext {
  version: string;
  configFilePath: string;
}

function separator(): CommandMenuItem {
  return { title: '<SEPARATOR>', tooltip: '', enabled: true };
}

function item(id: string, title: string, tooltip = ''): CommandMenuItem {
  return { title, tooltip, enabled: true, checked: false, id };
}

function submenu(id: string, title: string, children: CommandMenuItem[]): CommandMenuItem {
  return { title, tooltip: '', enabled: true, items: children, id };
}

/** 展示与打开用的地址：0.0.0.0 / :: 不可直接访问，回退到 127.0.0.1 */
export function listenUrl(config: RelayConfig): string {
  const host = config.host === '0.0.0.0' || config.host === '::' ? '127.0.0.1' : config.host;
  return `http://${host}:${config.port}`;
}

function statusTitle(state: RuntimeState): string {
  const { config } = state;
  switch (state.status) {
    case 'listening':
      return config.host === '0.0.0.0' || config.host === '::'
        ? `已监听 127.0.0.1:${config.port}（局域网）`
        : `已监听 ${config.host}:${config.port}`;
    case 'starting':
      return `正在启动 ${config.host}:${config.port}…`;
    case 'error':
      return `启动失败：${truncate(state.errorMessage ?? '未知错误')}`;
    default:
      return '未监听（点「开启监听」启动）';
  }
}

function truncate(text: string, limit = 48): string {
  const half = Math.floor(limit / 2);
  return text.length > limit ? `${text.slice(0, half)}…${text.slice(-half)}` : text;
}

/** 构建菜单（一次性；返回的 items 在 applyState 中被就地修改） */
export function createMenu(state: RuntimeState, ctx: MenuContext): Menu {
  const items: CommandMenuItem[] = [
    item('status', statusTitle(state), 'WebReader TTS 中转'),
    separator(),
    item(COMMAND.toggleListen, '开启监听'),
    separator(),
    submenu('host', '监听地址', HOST_CHOICES.map((c) => item(c.id, c.title))),
    submenu('port', '监听端口', PORT_CHOICES.map((p) => item(`port:${p}`, String(p)))),
    submenu('endpoint', 'Edge 端点', ENDPOINT_CHOICES.map((c) => item(c.id, c.title))),
    separator(),
    item(COMMAND.openBrowser, '在浏览器中打开'),
    item(COMMAND.copyAddress, '复制监听地址'),
    separator(),
    submenu(
      'about',
      '关于',
      [
        item('about-version', `版本 ${ctx.version}`),
        item('about-endpoint', ''),
        item('about-voices', ''),
        item('about-config', `配置文件：${truncate(ctx.configFilePath, 56)}`, ctx.configFilePath),
      ].map((it) => ({ ...it, enabled: false }))
    ),
    item(COMMAND.reloadConfig, '重新加载配置'),
    separator(),
    item(COMMAND.exit, '退出'),
  ];
  const menu: Menu = { icon: trayIcon(), title: 'WebReader 中转', tooltip: 'WebReader TTS 中转', items };
  applyState(menu, state);
  return menu;
}

/** 按当前状态刷新所有动态字段（标题 / 勾选 / 可用性 / tooltip） */
export function applyState(menu: Menu, state: RuntimeState): void {
  const items = menu.items as CommandMenuItem[];
  const { config } = state;
  const listening = state.status === 'listening';
  const url = listenUrl(config);

  const byId = (id: string): CommandMenuItem | undefined => items.find((it) => it.id === id);
  const child = (parentId: string, id: string): CommandMenuItem | undefined =>
    (byId(parentId)?.items as CommandMenuItem[] | undefined)?.find((it) => it.id === id);

  const status = byId('status');
  if (status) {
    status.title = statusTitle(state);
    status.tooltip = state.status === 'error' ? state.errorMessage ?? '未知错误' : url;
  }
  const toggle = byId(COMMAND.toggleListen);
  if (toggle) {
    toggle.title = listening || state.status === 'starting' ? '关闭监听' : '开启监听';
    toggle.enabled = state.status !== 'starting';
  }

  const hostMenu = byId('host');
  if (hostMenu) hostMenu.title = `监听地址（${config.host}）`;
  for (const choice of HOST_CHOICES) {
    const it = child('host', choice.id);
    if (it) it.checked = config.host === choice.value;
  }

  const portMenu = byId('port');
  if (portMenu) portMenu.title = `监听端口（${config.port}）`;
  for (const p of PORT_CHOICES) {
    const it = child('port', `port:${p}`);
    if (it) it.checked = config.port === p;
  }

  const endpointMenu = byId('endpoint');
  if (endpointMenu) endpointMenu.title = `Edge 端点（${config.edgeEndpoint}）`;
  for (const choice of ENDPOINT_CHOICES) {
    const it = child('endpoint', choice.id);
    if (it) it.checked = config.edgeEndpoint === choice.value;
  }

  const open = byId(COMMAND.openBrowser);
  if (open) open.enabled = listening;
  const copy = byId(COMMAND.copyAddress);
  if (copy) copy.enabled = listening;

  const aboutEndpoint = child('about', 'about-endpoint');
  if (aboutEndpoint) aboutEndpoint.title = `Edge 端点：${config.edgeEndpoint}`;
  const aboutVoices = child('about', 'about-voices');
  if (aboutVoices) {
    aboutVoices.title = listening || state.voicesCount > 0 ? `上游音色：${state.voicesCount} 个` : '上游音色：尚未获取';
  }

  menu.tooltip = listening ? `WebReader TTS 中转 — 已监听 ${url}` : 'WebReader TTS 中转 — 未监听';
}

/**
 * 深度展开所有菜单项（含子菜单子项）。
 *
 * systray2 在初始化时按 DFS 顺序给每个菜单项分配内部 __id，点击回指依赖它；
 * 刷新时要逐项比对，也必须按同一顺序遍历。
 */
export function flattenItems(menu: Menu): CommandMenuItem[] {
  const out: CommandMenuItem[] = [];
  const walk = (items: CommandMenuItem[]): void => {
    for (const it of items) {
      out.push(it);
      if (it.items) walk(it.items as CommandMenuItem[]);
    }
  };
  walk(menu.items as CommandMenuItem[]);
  return out;
}

/** 菜单项变化指纹：systray2 只在 title / checked / enabled 变化时才会真正重绘该项 */
export function signatureOf(item: CommandMenuItem): string {
  return `${item.title}|${item.checked ? 1 : 0}|${item.enabled === false ? 0 : 1}`;
}

/** 对整份菜单取指纹快照（首次渲染后建立基线，之后只发变化的项） */
export function snapshotOf(menu: Menu): Map<number, string> {
  const snapshot = new Map<number, string>();
  for (const it of flattenItems(menu)) {
    if (it.__id !== undefined) snapshot.set(it.__id, signatureOf(it));
  }
  return snapshot;
}

/**
 * 与快照比对，挑出需要 update-item 的菜单项。
 *
 * 不能只发 update-menu：systray2 / getlantern 的 update-menu 只更新顶层
 * （title / tooltip / icon），菜单项的标题 / 勾选 / 可用性必须逐项 update-item
 * 才会重绘。只发 update-menu 会让菜单一直停在创建时的状态，用户看到的「开关监听」
 * 与服务实际状态脱节，表现为点击毫无反应。
 */
export function itemsToUpdate(menu: Menu, snapshot: Map<number, string>): CommandMenuItem[] {
  const changed: CommandMenuItem[] = [];
  for (const it of flattenItems(menu)) {
    if (it.__id === undefined) continue;
    if (snapshot.get(it.__id) !== signatureOf(it)) changed.push(it);
  }
  return changed;
}
