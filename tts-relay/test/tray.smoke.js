/** 托盘 / 配置 / 运行时层冒烟测试（无需 GUI）：菜单结构、配置优先级与归一化、持久化、运行时启停与热更新。 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');

const { createMenu, applyState, listenUrl, flattenItems, snapshotOf, itemsToUpdate, PORT_CHOICES, HOST_CHOICES, ENDPOINT_CHOICES } = require(`${ROOT}/dist/tray/menu.js`);
const { resolveConfig, normalizeConfig, DEFAULT_CONFIG } = require(`${ROOT}/dist/config/index.js`);
const store = require(`${ROOT}/dist/config/store.js`);
const { RelayRuntime } = require(`${ROOT}/dist/runtime/relay-runtime.js`);

let failures = 0;
// 测试里的日志写到临时文件，不落在仓库里（logger 读 RELAY_LOG_FILE）
const tmpLog = path.join(os.tmpdir(), `relay-test-${process.pid}.log`);
process.env.RELAY_LOG_FILE = tmpLog;
const t = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); } catch (e) { failures++; console.log(`FAIL  ${name} — ${e.message}`); };
};

function menuItemTitles(menu) {
  return menu.items.filter((it) => it.title !== '<SEPARATOR>').map((it) => it.title);
}
function findById(menu, id) {
  for (const it of menu.items) {
    if (it.id === id) return it;
    const child = (it.items || []).find((c) => c.id === id);
    if (child) return child;
  }
  return undefined;
}

// ---- 菜单 ----
t('菜单未监听态：状态行与开启项正确', () => {
  const menu = createMenu({ status: 'stopped', config: DEFAULT_CONFIG, voicesCount: 0 }, { version: '0.2.0', configFilePath: '/tmp/x.json' });
  const status = findById(menu, 'status');
  const toggle = findById(menu, 'toggle-listen');
  const open = findById(menu, 'open-browser');
  assert.ok(status, 'status item exists');
  assert.ok(status.title.includes('未监听'), `status=${status.title}`);
  assert.strictEqual(toggle.title, '开启监听');
  assert.strictEqual(open.enabled, false);
});

t('菜单监听态：0.0.0.0 地址回退展示 127.0.0.1，勾选态正确', () => {
  const state = { status: 'listening', config: { ...DEFAULT_CONFIG, host: '0.0.0.0', port: 9000, edgeEndpoint: 'msedgeservices' }, voicesCount: 322 };
  const menu = createMenu(state, { version: '0.2.0', configFilePath: '/tmp/x.json' });
  const status = findById(menu, 'status');
  assert.ok(status.title.includes('已监听 127.0.0.1:9000'), `status=${status.title}`);
  assert.ok(status.title.includes('局域网'));
  assert.strictEqual(findById(menu, 'toggle-listen').title, '关闭监听');
  assert.strictEqual(findById(menu, 'open-browser').enabled, true);
  assert.strictEqual(findById(menu, 'copy-address').enabled, true);
  assert.strictEqual(findById(menu, 'host:0.0.0.0').checked, true);
  assert.strictEqual(findById(menu, 'host:127.0.0.1').checked, false);
  assert.strictEqual(findById(menu, 'port:9000').checked, true);
  assert.strictEqual(findById(menu, 'endpoint:msedgeservices').checked, true);
  assert.strictEqual(findById(menu, 'endpoint:bing').checked, false);
  assert.ok(menu.tooltip.includes('已监听'), `tooltip=${menu.tooltip}`);
});

t('菜单错误态：状态行带原因且 tooltip 为完整错误', () => {
  const menu = createMenu({ status: 'error', config: DEFAULT_CONFIG, errorMessage: '地址已被占用', voicesCount: 0 }, { version: '0.2.0', configFilePath: '/tmp/x.json' });
  const status = findById(menu, 'status');
  assert.ok(status.title.startsWith('启动失败'), `status=${status.title}`);
  assert.strictEqual(status.tooltip, '地址已被占用');
});

t('applyState 就地刷新且保持菜单项引用（点击回指依赖此不变量）', () => {
  const menu = createMenu({ status: 'stopped', config: DEFAULT_CONFIG, voicesCount: 0 }, { version: '0.2.0', configFilePath: '/tmp/x.json' });
  const refs = menu.items.slice();
  applyState(menu, { status: 'listening', config: { ...DEFAULT_CONFIG, port: 8000 }, voicesCount: 0 });
  assert.deepStrictEqual(menu.items, refs, 'items 数组与对象引用必须不变');
  assert.strictEqual(findById(menu, 'port:8000').checked, true);
  assert.strictEqual(findById(menu, 'toggle-listen').title, '关闭监听');
});

t('所有可点击菜单项都有 id 且唯一', () => {
  const menu = createMenu({ status: 'listening', config: DEFAULT_CONFIG, voicesCount: 0 }, { version: '0.2.0', configFilePath: '/tmp/x.json' });
  const ids = [];
  const walk = (items) => items.forEach((it) => {
    if (it.title !== '<SEPARATOR>') {
      assert.ok(it.id, `item 缺 id：${it.title}`);
      ids.push(it.id);
      if (it.items) walk(it.items);
    }
  });
  walk(menu.items);
  assert.deepStrictEqual(ids, [...new Set(ids)], `id 有重复：${ids}`);
  // 快捷项覆盖预期命令
  for (const p of PORT_CHOICES) assert.ok(ids.includes(`port:${p}`), `缺端口项 port:${p}`);
  for (const c of [...HOST_CHOICES, ...ENDPOINT_CHOICES]) assert.ok(ids.includes(c.id), `缺选项 ${c.id}`);
  ['toggle-listen', 'open-browser', 'copy-address', 'reload-config', 'exit'].forEach((id) =>
    assert.ok(ids.includes(id), `缺命令 ${id}`));
});

t('listenUrl：0.0.0.0 / :: 回退 127.0.0.1', () => {
  assert.strictEqual(listenUrl({ ...DEFAULT_CONFIG, host: '0.0.0.0', port: 8787 }), 'http://127.0.0.1:8787');
  assert.strictEqual(listenUrl({ ...DEFAULT_CONFIG, host: '::', port: 8787 }), 'http://127.0.0.1:8787');
  assert.strictEqual(listenUrl({ ...DEFAULT_CONFIG, host: '127.0.0.1', port: 8787 }), 'http://127.0.0.1:8787');
});

// ---- 菜单刷新指纹（核心修复：update-menu 不重绘菜单项，必须逐个 update-item）----
// systray2 在初始化时按 DFS 顺序给菜单项分配 __id，测试里模拟这个分配
function assignIds(menu) {
  flattenItems(menu).forEach((it, i) => { it.__id = i + 1; });
}

t('itemsToUpdate：基线快照下没有待更新项', () => {
  const menu = createMenu({ status: 'stopped', config: DEFAULT_CONFIG, voicesCount: 0 }, { version: '0.2.0', configFilePath: '/tmp/x.json' });
  assignIds(menu);
  assert.deepStrictEqual(itemsToUpdate(menu, snapshotOf(menu)), []);
});

t('itemsToUpdate：状态变化后只挑出真正变化的菜单项', () => {
  const menu = createMenu({ status: 'stopped', config: DEFAULT_CONFIG, voicesCount: 0 }, { version: '0.2.0', configFilePath: '/tmp/x.json' });
  assignIds(menu);
  const snapshot = snapshotOf(menu);
  applyState(menu, { status: 'listening', config: DEFAULT_CONFIG, voicesCount: 322 });
  const changed = itemsToUpdate(menu, snapshot).map((it) => it.id);
  // 状态行 / 开关 / 音色计数 / 浏览器与复制按钮的可用性都随状态变化
  ['status', 'toggle-listen', 'about-voices', 'open-browser', 'copy-address'].forEach((id) =>
    assert.ok(changed.includes(id), `应挑出变化项 ${id}`));
  // 配置未变，端口 / 地址 / 端点快捷项不应被挑出
  ['port:8787', 'host:127.0.0.1', 'endpoint:bing'].forEach((id) =>
    assert.ok(!changed.includes(id), `不应挑出未变化项 ${id}`));
});

// ---- 配置优先级与归一化 ----
t('resolveConfig：无文件无环境变量 = 默认值', () => {
  const envKeys = ['PORT', 'HOST', 'RELAY_AUTH_TOKEN', 'EDGE_ENDPOINT', 'EDGE_TRUSTED_CLIENT_TOKEN', 'EDGE_CHROMIUM_VERSION', 'EDGE_OUTPUT_FORMAT', 'MAX_CONCURRENCY', 'MAX_PER_CLIENT', 'MAX_QUEUE_SIZE', 'VOICES_TTL_MS', 'SYNTH_TIMEOUT_MS'];
  const saved = {};
  envKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  try {
    assert.deepStrictEqual(resolveConfig(null), DEFAULT_CONFIG);
  } finally {
    Object.entries(saved).forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; });
  }
});

t('resolveConfig：环境变量显式设置时覆盖文件', () => {
  const savedPort = process.env.PORT;
  process.env.PORT = '8787';
  try {
    const cfg = resolveConfig({ port: 9000, host: '0.0.0.0' });
    assert.strictEqual(cfg.port, 8787, 'env PORT 必须胜过文件');
    assert.strictEqual(cfg.host, '0.0.0.0', '未设环境变量的字段取文件值');
  } finally {
    if (savedPort === undefined) delete process.env.PORT; else process.env.PORT = savedPort;
  }
});

t('normalizeConfig：端口非法回退默认、枚举收紧', () => {
  assert.strictEqual(normalizeConfig({ ...DEFAULT_CONFIG, port: 0 }).port, DEFAULT_CONFIG.port);
  assert.strictEqual(normalizeConfig({ ...DEFAULT_CONFIG, port: 70000 }).port, DEFAULT_CONFIG.port);
  assert.strictEqual(normalizeConfig({ ...DEFAULT_CONFIG, port: 80 }).port, 80);
  assert.strictEqual(normalizeConfig({ ...DEFAULT_CONFIG, edgeEndpoint: 'garbage' }).edgeEndpoint, 'bing');
  assert.strictEqual(normalizeConfig({ ...DEFAULT_CONFIG, maxConcurrency: 999 }).maxConcurrency, DEFAULT_CONFIG.maxConcurrency);
});

// ---- 后台化判断（detach） ----
const detach = require(`${ROOT}/dist/runtime/detach.js`);

function withTty(isTty, argvExtra, envExtra, fn) {
  const savedArgv = process.argv.slice();
  const savedEnv = {};
  Object.keys(envExtra).forEach((k) => { savedEnv[k] = process.env[k]; });
  const savedIsTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  process.argv = [process.argv[0], 'dist/index.js', ...argvExtra];
  Object.entries(envExtra).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: isTty });
  try { fn(); } finally {
    process.argv = savedArgv;
    Object.entries(savedEnv).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    if (savedIsTty) Object.defineProperty(process.stdout, 'isTTY', savedIsTty);
    else delete (process.stdout).isTTY;
  }
}

t('needsBackgroundLaunch：托盘+TTY 才后台化', () => {
  withTty(true, [], {}, () => {
    assert.strictEqual(detach.needsBackgroundLaunch('tray'), true, '托盘+TTY 应后台化');
  });
});

t('needsBackgroundLaunch：无头模式不后台化（交给进程管理器）', () => {
  withTty(true, [], {}, () => {
    assert.strictEqual(detach.needsBackgroundLaunch('headless'), false);
  });
});

t('needsBackgroundLaunch：非 TTY（管道/无控制台）不重复拉起', () => {
  withTty(false, [], {}, () => {
    assert.strictEqual(detach.needsBackgroundLaunch('tray'), false);
  });
});

t('needsBackgroundLaunch：已分离标记 / --foreground 不再后台化', () => {
  withTty(true, [], { RELAY_DETACHED: '1' }, () => {
    assert.strictEqual(detach.needsBackgroundLaunch('tray'), false, 'RELAY_DETACHED=1 不应再分离');
  });
  withTty(true, ['--foreground'], {}, () => {
    assert.strictEqual(detach.needsBackgroundLaunch('tray'), false, '--foreground 应保持前台');
  });
});

t('backgroundLaunchMessage：含日志路径与 PID', () => {
  const msg = detach.backgroundLaunchMessage('/tmp/tts-relay.log', 12345);
  assert.ok(msg.includes('关闭此终端不会退出程序'), msg);
  assert.ok(msg.includes('/tmp/tts-relay.log'), msg);
  assert.ok(msg.includes('PID 12345'), msg);
});

// ---- 持久化（临时文件，不污染仓库） ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-cfg-'));
const tmpConfig = path.join(tmpDir, 'config.json');
const savedCfgFile = process.env.RELAY_CONFIG_FILE;
process.env.RELAY_CONFIG_FILE = tmpConfig;

t('writeConfigFile / readConfigFile 往返', () => {
  store.writeConfigFile({ ...DEFAULT_CONFIG, port: 9100 });
  const read = store.readConfigFile();
  assert.strictEqual(read.port, 9100);
  assert.strictEqual(store.loadConfig().port, 9100);
});

t('损坏的配置文件被忽略且不抛出', () => {
  fs.writeFileSync(tmpConfig, '{ not json ');
  const read = store.readConfigFile();
  assert.strictEqual(read, null);
  assert.deepStrictEqual(store.loadConfig().port, DEFAULT_CONFIG.port);
});

t('非对象 JSON 被忽略', () => {
  fs.writeFileSync(tmpConfig, '[1,2,3]');
  assert.strictEqual(store.readConfigFile(), null);
});

t('ensureConfigFile：缺失时写入、存在时不动', () => {
  fs.rmSync(tmpConfig, { force: true });
  store.ensureConfigFile({ ...DEFAULT_CONFIG, port: 9200 });
  assert.strictEqual(JSON.parse(fs.readFileSync(tmpConfig, 'utf8')).port, 9200);
  const before = fs.readFileSync(tmpConfig, 'utf8');
  store.ensureConfigFile({ ...DEFAULT_CONFIG, port: 9300 });
  assert.strictEqual(fs.readFileSync(tmpConfig, 'utf8'), before, '已存在则不覆盖');
});

process.env.RELAY_CONFIG_FILE = savedCfgFile === undefined ? undefined : savedCfgFile;
fs.rmSync(tmpDir, { recursive: true, force: true });

// ---- 运行时 ----
function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}
const isFree = (port) => new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => resolve(false));
  srv.once('listening', () => srv.close(() => resolve(true)));
  srv.listen(port, '127.0.0.1');
});

(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const port1 = await freePort();
  const port2 = await freePort();
  const cfgFile = path.join(os.tmpdir(), `relay-runtime-${port1}.json`);
  process.env.RELAY_CONFIG_FILE = cfgFile;

  await new Promise((resolveTest) => {
    const runtime = new RelayRuntime({ ...DEFAULT_CONFIG, port: port1 });
    const states = [];
    runtime.setListener((s) => states.push(s.status));

    const step = async (name, fn) => {
      try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failures++; console.log(`FAIL  ${name} — ${e.message}`); }
    };

    (async () => {
      await step('运行时 start：进入 listening 且占用端口', async () => {
        await runtime.start();
        assert.strictEqual(runtime.getState().status, 'listening');
        assert.ok(await isFree(port1) === false, '端口应被占用');
        assert.ok(states.includes('starting') && states.includes('listening'));
      });

      await step('运行时 update(port)：落盘并在新端口重启', async () => {
        await runtime.update({ port: port2 });
        assert.strictEqual(runtime.getConfig().port, port2);
        assert.ok(await isFree(port1), '旧端口应释放');
        assert.ok((await isFree(port2)) === false, '新端口应被占用');
        const persisted = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
        assert.strictEqual(persisted.port, port2, '配置应写入文件');
      });

      await step('运行时 stop：进入 stopped 且释放端口', async () => {
        await runtime.stop();
        assert.strictEqual(runtime.getState().status, 'stopped');
        assert.ok(await isFree(port2));
      });

      await step('运行时 update 于停止态：改配置但不监听', async () => {
        await runtime.update({ host: '0.0.0.0' });
        assert.strictEqual(runtime.getConfig().host, '0.0.0.0');
        assert.strictEqual(runtime.getState().status, 'stopped');
      });

      await step('运行时 reload：重读文件并应用', async () => {
        const raw = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
        raw.host = '127.0.0.1';
        raw.port = port1;
        fs.writeFileSync(cfgFile, JSON.stringify(raw));
        await runtime.reload();
        assert.strictEqual(runtime.getConfig().host, '127.0.0.1');
        await runtime.stop();
      });

      await step('运行时 start 于被占用端口：进入 error 且不抛出', async () => {
        const blocker = net.createServer();
        await new Promise((r) => blocker.listen(port1, '127.0.0.1', r));
        const busy = new RelayRuntime({ ...DEFAULT_CONFIG, port: port1 });
        await busy.start();
        assert.strictEqual(busy.getState().status, 'error');
        assert.ok((busy.getState().errorMessage || '').includes('占用'), `msg=${busy.getState().errorMessage}`);
        await new Promise((r) => blocker.close(r));
      });

      await step('托盘派发 port:xxxx：改端口并落盘（点击处理器的真实路径）', async () => {
        const { RelayTray } = require(`${ROOT}/dist/tray/relay-tray.js`);
        const port3 = await freePort();
        const rt = new RelayRuntime({ ...DEFAULT_CONFIG, port: port2 });
        await rt.start();
        const tray = new RelayTray({ runtime: rt, version: '0.2.0' });
        // dispatch 是私有方法，但编译为 CommonJS 后可访问；模拟菜单点击回调的入参
        await tray.dispatch({ type: 'clicked', seq_id: 1, __id: 1, item: { title: '监听端口', tooltip: '', id: `port:${port3}` } });
        assert.strictEqual(rt.getConfig().port, port3, '派发应改端口');
        assert.ok((await isFree(port3)) === false, '新端口应被占用');
        assert.strictEqual(JSON.parse(fs.readFileSync(cfgFile, 'utf8')).port, port3, '应落盘');
        await rt.stop();
      });

      await step('托盘派发 toggle-listen：关闭监听', async () => {
        const { RelayTray } = require(`${ROOT}/dist/tray/relay-tray.js`);
        const rt = new RelayRuntime({ ...DEFAULT_CONFIG, port: port2 });
        await rt.start();
        const tray = new RelayTray({ runtime: rt, version: '0.2.0' });
        await tray.dispatch({ type: 'clicked', seq_id: 1, __id: 1, item: { title: '关闭监听', tooltip: '', id: 'toggle-listen' } });
        assert.strictEqual(rt.getState().status, 'stopped');
      });

      fs.rmSync(cfgFile, { force: true });
      resolveTest();
    })().catch((e) => { failures++; console.log(`FAIL  运行时套件 — ${e.message}`); resolveTest(); });
  });

  fs.rmSync(tmpLog, { force: true });
  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
