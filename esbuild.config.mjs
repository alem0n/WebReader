// 构建脚本：将 src 下的三个入口打包为 Chrome MV3 扩展所需的独立 JS 文件，
// 并把 public/ 下的静态资源（manifest、html、css、图标、语言文件）原样复制到 dist/。
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isWatch = process.argv.includes('--watch');
const outDir = resolve(__dirname, 'dist');
const publicDir = resolve(__dirname, 'public');

// 清理并重建输出目录
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 复制静态资源
cpSync(publicDir, outDir, { recursive: true });

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: {
    background: resolve(__dirname, 'src/background/index.ts'),
    content: resolve(__dirname, 'src/content/index.ts'),
    popup: resolve(__dirname, 'src/popup/index.ts'),
  },
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outdir: outDir,
  define: { 'process.env.NODE_ENV': '"production"' },
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[build] watching for changes...');
} else {
  await esbuild.build(options);
  console.log('[build] done');
}
