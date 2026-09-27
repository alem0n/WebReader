# ADR-0005 —— tts-relay 打包为跨平台单文件可执行（Node SEA）

- **状态**：采纳
- **日期**：2026-09-27

## 背景

ADR 0004 让 tts-relay 变成了带托盘 UI 的桌面常驻程序。但分发形态仍是「需要用户本机
装 Node.js + 拉源码 + npm install」，对只想「双击运行一个托盘程序」的用户门槛过高。
需求是：**打包成跨平台单文件二进制**，用户下载即用，且不要求本机有编译工具链。

核心约束与排查结论：

- **systray2 的托盘是预编译 Go 二进制，运行时必须以真实文件存在于磁盘上才能被 spawn**。
  它不能被「打包进 JS bundle」，也不是 `.node` 原生插件——这排除了「真·单文件」的朴素理解。
- 依赖全是纯 JS（`ws` / `systray2` 的 JS 壳 / `debug` / `fs-extra`），无原生模块，
  满足单文件打包的前提。
- 备选方案淘汰过程：
  - **vercel/pkg**：官方已归档（2024）停止维护，且其「虚拟文件系统」对 spawn 外部二进制
    的支持需要额外配置；
  - **@yao-pkg/pkg**（社区分叉）：维护节奏跟随 Node 主线，且新版本自身也在迁向 SEA；
  - **Bun compile**：引入新运行时，与扩展端（Chrome MV3 / Node 工具链）技术栈不一致；
  - **Node SEA**：Node 官方方向，Node 25.5+ 内置 `--build-sea` 一步出可执行文件，
    无本机编译、无新运行时、无额外依赖。

`store.ts` 里早已预留的 `process.pkg` 判断说明「打包形态」一直在预期演进路径上，
本次把它落地为 SEA，并补上 SEA 特有的路径与资源处理。

## 决策

### 1. 用 Node SEA（`--build-sea`）作为打包手段，pkg 路径仅留兼容

新增 `tts-relay/pack.mjs`（`npm run pack`）：先 esbuild 打成单文件 CJS，
再 `node --build-sea` 注入资源产出可执行文件。`useCodeCache` / `useSnapshot` 一律 `false`
——二者只在编译时的平台上可加载，跨平台构建会产出不可执行的二进制。

Node 25.5 之前的版本只有 `--experimental-sea-config`（只产 blob，需再借 postject 注入）。
`pack.mjs` 用 `--help` 探测 `--build-sea` 是否存在，旧版本退化为「产出 blob 并提示」，
不自动引入 postject（它需要本机存在目标平台的 node 二进制做注入基底，跨平台场景不通用）。

### 2. 托盘二进制走 SEA assets + 运行时释放到 systray2 的缓存目录

这是本 ADR 最关键的机制。systray2 内部 `getTrayBinPath` 的行为是：
`copyDir` 为真时算出 `~/.cache/node-systray/<systray2版本>/<平台文件名>`，
**若该文件已存在就直接返回它去 spawn，跳过拷贝分支**。

因此对接方式定为：

- 构建期：把当前平台的 `tray_*_release[.exe]` 以「资源名 = 平台文件名」登记进 sea-config；
- 运行时（`src/packaging/sea.ts`）：启动托盘前 `getRawAsset` 取回，写入同一个缓存目录，
  再以 `copyDir: true` 构造 `SysTray`。

路径里的版本号取自 `import 'systray2/package.json'`，与库内部用的是同一份值，
升级 systray2 时缓存目录自然跟随，**不硬编码版本字符串**。

### 3. 打包态的配置 / 日志目录改取「可执行文件所在目录」

`resolveAppDir()` 新增最高优先级分支：SEA 形态取 `dirname(process.execPath)`。
原因：打包后 `__dirname` 指向 SEA 内部虚拟路径，不再能用来定位用户配置。
语义与既有的「配置文件与二进制同目录」一致，只是探测方式不同。

### 4. `node:sea` 懒加载 + 容错，兼容旧 Node

`packaging/sea.ts` 用受保护的 `require('node:sea')` 而非静态 import：
Node 18 及更早没有这个内置模块，静态 import 会在加载期直接失败；懒加载失败时视为「未打包」，
node 形态行为完全不变。`extractTrayBinary()` 在非打包形态下是空操作，且对磁盘异常只告警不抛出
——托盘起不来时由上层（index.ts）统一回退无头模式，保证服务可用。

## 结果

- 正面影响：
  - 用户拿到单文件即可运行（Windows 实测 95MB，含 Node 运行时 + 托盘二进制 + 全部依赖），
    无需本机 Node / 编译链；
  - 打包形态与 node 形态共用同一份源码与菜单逻辑，`npm run verify:relay` 一套测试同时覆盖
    （`test/sea.e2e.cjs` 跑真实 exe：HTTP `/v1/health` / `/v1/voices` 实响应 + 托盘真就绪
    + 二进制真落缓存目录）；
  - 环境变量驱动的服务器 / 容器部署零影响（无头模式不碰打包逻辑）。
- 代价 / 风险：
  - **单平台构建**：SEA 产出的二进制只能在构建平台上运行，跨平台需在三个平台分别构建
    （或分别准备三个平台的 node 二进制），CI 需按平台矩阵；
  - `--build-sea` 是 Node 25.5+ 才有的便利路径，用旧版本打包需额外 postject 步骤；
  - 单文件体积 ≈ Node 运行时（~90MB），对「轻量」场景并不轻量；
  - 托盘二进制首次启动会写一份到用户家目录缓存（~3.6MB），已在 ADR 0005 相关文档说明。
- 触发重评估的条件：
  - 需要在一个平台产出全部平台的二进制（交叉编译）时，考虑改用 Bun compile 或 CI 矩阵 +
    postject 方案；
  - systray2 改动其缓存目录约定（`~/.cache/node-systray/<version>`）时，
    `trayBinCacheDir()` 必须同步，否则 `copyDir` 会退回拷贝分支并因源文件不存在而失败；
  - Node 的 SEA API（`getRawAsset` 资源读取）发生不兼容变更时。

## 反向链接

- `AGENTS.md` §1.1「打包形态」决策行、§2 命令、§3 改动类型；
- `RULES.md` §6（tts-relay 代码地图含 packaging/sea.ts 与 pack.mjs）；
- `tts-relay/README.md`「打包为单文件可执行」章节；
- 关联 ADR：[0004](./0004-tts-relay-tray-ui-and-config-persistence.md)（托盘 UI 与配置持久化，
  本 ADR 延续其「配置与二进制同目录」语义）；
- `docs/tech-debt.md`：单平台构建的登记条目。
