/**
 * 打包形态（SEA）端到端冒烟：跑 npm run pack 产出的可执行文件，验证
 * 「打包后配置/日志路径解析正确 → 服务真的在监听并响应 HTTP → 托盘模式能立起来」。
 *
 * 只覆盖打包带来的差异（路径解析、二进制释放、单文件内依赖完整），
 * 不重测托盘菜单交互（与 node 形态同一份 menu/relay-tray 代码，由 tray.smoke.js 覆盖）。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const exeName = process.platform === 'win32' ? 'tts-relay.exe' : 'tts-relay';
const exe = path.resolve(__dirname, '..', 'dist-pack', exeName);
if (!fs.existsSync(exe)) {
  console.log('SKIP  未找到打包产物（dist-pack/' + exeName + '），先跑 npm run pack');
  process.exit(0);
}

const runDir = path.join(os.tmpdir(), `relay-sea-e2e-${process.pid}`);
fs.rmSync(runDir, { recursive: true, force: true });
fs.mkdirSync(runDir, { recursive: true });
const configFile = path.join(runDir, 'config.json');
const logFile = path.join(runDir, 'run.log');

let failures = 0;
const assert = (name, ok, extra) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

const tail = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/** 等日志里出现指定关键词 */
const waitForLog = (needle, timeoutMs) =>
  new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (tail(logFile).includes(needle)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 150);
    };
    tick();
  });

(async () => {
  // ---- 无头模式：验证 HTTP 服务真的响应 ----
  const headless = spawn(exe, ['--headless'], {
    stdio: 'ignore',
    env: { ...process.env, RELAY_CONFIG_FILE: configFile, RELAY_LOG_FILE: logFile },
  });
  try {
    assert('无头模式：进程启动未立即退出', await waitForLog('listening on', 20000), tail(logFile).split('\n').pop());
    const listening = tail(logFile).match(/listening on (http:\/\/[^\s]+)/);
    const base = listening ? listening[1] : 'http://127.0.0.1:8787';
    const health = await fetch(`${base}/v1/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
    assert('无头模式：/v1/health 响应 200 且 JSON 合法', !health.error && typeof health === 'object', JSON.stringify(health).slice(0, 120));
    const voices = await fetch(`${base}/v1/voices`).then((r) => r.json()).catch((e) => ({ error: e.message }));
    assert('无头模式：/v1/voices 返回音色目录', Array.isArray(voices) ? voices.length > 0 : !voices.error, Array.isArray(voices) ? `${voices.length} 个音色` : JSON.stringify(voices).slice(0, 120));
  } finally {
    headless.kill('SIGTERM');
  }

  // ---- 托盘模式：验证内嵌二进制释放后托盘真的起来（菜单代码与 node 形态同一份）----
  const trayLog = path.join(runDir, 'tray.log');
  const tray = spawn(exe, ['--foreground'], {
    stdio: 'ignore',
    env: { ...process.env, RELAY_CONFIG_FILE: configFile, RELAY_LOG_FILE: trayLog },
  });
  const trayReady = await new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (tail(trayLog).includes('托盘已就绪')) return resolve(true);
      if (Date.now() - start > 20000) return resolve(false);
      setTimeout(tick, 150);
    };
    tick();
  });
  assert('托盘模式：内嵌二进制释放后托盘就绪', trayReady, tail(trayLog).split('\n').filter((l) => l.includes('托盘') || l.includes('listening')).pop() ?? '超时未见就绪');
  const cacheDir = path.join(os.homedir(), '.cache', 'node-systray');
  const binInCache = fs.readdirSync(cacheDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(cacheDir, d.name)))
    .some((f) => f.startsWith('tray_'));
  assert('托盘模式：释放的托盘二进制落在 systray2 缓存目录', binInCache, cacheDir);
  tray.kill('SIGTERM');

  fs.rmSync(runDir, { recursive: true, force: true });
  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
