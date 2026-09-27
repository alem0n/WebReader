// 打包脚本（跨平台）：把 tts-relay 打成单文件可执行（Node SEA）。
//
// 两步：
// 1) esbuild 把 src/index.ts 与全部依赖（ws / systray2 / debug / fs-extra，
//    均为纯 JS）打成一个 CommonJS 单文件；托盘 Go 二进制不是 JS，不能打进 JS 包，
//    改由 SEA 的 assets 内嵌、运行时由 packaging/sea.ts 释放到 systray2 缓存目录。
// 2) node --build-sea 生成最终可执行文件（Node 25.5+ 内置；旧版 Node 见下方回退）。
//
// 输出目录 dist-pack/（构建产物，不入库）。
import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = resolve(__dirname, 'dist-pack');
const bundleName = 'index.cjs';
const bundlePath = resolve(outDir, bundleName);

const isWin = process.platform === 'win32';
const exeName = isWin ? 'tts-relay.exe' : 'tts-relay';
const trayBinName = isWin
  ? 'tray_windows_release.exe'
  : process.platform === 'darwin'
    ? 'tray_darwin_release'
    : 'tray_linux_release';
const trayBinPath = resolve(__dirname, 'node_modules', 'systray2', 'traybin', trayBinName);

/** Node 25.5+ 才有 --build-sea；用 --help 探测而不是硬编码版本号，避免维护漂移 */
const buildSeaSupported = /--build-sea/.test(spawnSync(process.execPath, ['--help'], { encoding: 'utf8' }).stdout ?? '');

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

if (!existsSync(trayBinPath)) {
  throw new Error(`缺少托盘二进制：${trayBinPath}（请先在 tts-relay 目录运行 npm install）`);
}

// ---- 第 1 步：esbuild 打包成单文件 CJS ----
await esbuild.build({
  entryPoints: [resolve(__dirname, 'src', 'index.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: bundlePath,
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  define: { 'process.env.RELAY_PACKAGING': '"sea"' },
  logLevel: 'info',
});
console.log(`[pack] 已生成 bundle：${bundlePath}`);

// ---- 第 2 步：写 sea-config.json 并构建 SEA ----
const seaConfigPath = resolve(outDir, 'sea-config.json');
const seaConfig = {
  main: bundlePath,
  output: resolve(outDir, exeName),
  // 关闭代码缓存与快照：二者只在编译时的平台上可加载，跨平台构建会产出不可执行的二进制
  useCodeCache: false,
  useSnapshot: false,
  disableExperimentalSEAWarning: true,
  // 资源名 = 平台文件名，运行时按同名取回（packaging/sea.ts 的 getRawAsset）
  assets: { [trayBinName]: trayBinPath },
};
writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

if (buildSeaSupported) {
  const result = spawnSync(process.execPath, ['--build-sea', seaConfigPath], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('node --build-sea 失败，详见上方输出');
} else {
  // Node < 25.5：--experimental-sea-config 只产出 blob，需再借 postject 注入。
  // postject 需要本机存在目标平台的 node 二进制做注入基底，跨平台场景不通用，
  // 因此这里只产出 blob 并提示路径，不自动引入依赖；本机构建建议改用 Node 25.5+。
  const blobPath = resolve(outDir, 'sea.blob');
  const result = spawnSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('node --experimental-sea-config 失败，详见上方输出');
  console.warn(
    `[pack] 当前 Node（${process.version}）不支持 --build-sea，只生成了 blob：${blobPath}。` +
      `请用 Node 25.5+ 的 --build-sea 一步产出可执行文件，或自行用 postject 注入。`,
  );
  process.exit(0);
}

const exePath = resolve(outDir, exeName);
if (!existsSync(exePath)) throw new Error(`预期产出的可执行文件不存在：${exePath}`);
console.log(`[pack] 打包完成：${exePath}`);
