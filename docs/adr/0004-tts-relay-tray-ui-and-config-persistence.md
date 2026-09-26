# ADR-0004 —— tts-relay 增加托盘 UI 层与配置持久化

- **状态**：采纳
- **日期**：2026-09-27

## 背景

改造前 `tts-relay` 只能以「前台进程 + 环境变量」形态运行：改端口要改启动命令并重启，
关掉终端就停服。对自部署的桌面用户，这与「后台常驻的本地 TTS 服务」的心智模型不符：
没有驻留入口、没有运行状态可见、配置改一次要重写部署命令。

需求是加一层托盘 UI：进程驻留为系统托盘图标，右键菜单查看监听地址、开启 / 关闭
监听、配置监听端口等，配置持久化到**二进制所在目录的配置文件**。

约束：

1. 这是后端独立 npm 项目，运行在用户机器上（不再是浏览器沙箱），可用 Node 全套能力；
2. 跨平台（Windows / Linux / macOS），且**不能要求用户本机有编译工具链**；
3. 环境变量驱动的服务器 / 容器部署是既有用法，不能破坏；
4. 托盘是「尽力而为」的桌面便利层，不能成为服务可用性的单点——无桌面环境也要能跑。

## 决策

### 1. 托盘库选 systray2（预编译 Go 二进制）

`systray2@2.1.4`（felixhao28/node-systray 一脉）自带三平台预编译二进制，Node 侧经
stdin/stdout 通信，**零本机编译**。排除项：Electron 太重；`@nut-tree-fork/nut-js`
等需 node-gyp 原生编译，用户机易失败；`node-systray-v2` 未发布到 npm registry
（只能装 GitHub，CI / 用户安装不可复现）。

代价：菜单能力受限于库（无原生输入框、无通知 API），见下文「端口配置 UX」。

### 2. 新增 runtime 层，UI 只通过它驱动服务

`runtime/relay-runtime.ts` 持有 engine / 音色目录 / 并发队列 / HTTP 服务，对外是
`start / stop / restart / update / reload / shutdown` + 状态订阅。`tray/` 只调这些
接口，不直接碰 `http` / 引擎。`api/http.ts` 的 `createRelayServer` 因此**不再自行
listen**（创建与监听分离，listen 归运行时），这是内部重构，调用方只有运行时。

### 3. 配置三级优先：环境变量（显式）> 文件 > 默认

- 服务器 / 容器：环境变量显式设置即生效，与改造前**完全一致**；
- 桌面：无环境变量时由 `config.json` 决定，托盘改动写回文件；
- 托盘 `update()` 直接改内存配置并立即落盘 + 重启，**所见即所得**（即使同名环境变量
  存在也以本次会话的托盘值为准）；「重新加载配置」才会重读文件。

### 4. 配置文件位置 = 二进制所在目录

打包成单文件可执行（`process.pkg`）时取可执行文件目录；`node dist/index.js` 时取
项目根（入口在 `dist/`，配置不能混进会被构建清空的产物目录）。可用
`RELAY_CONFIG_FILE` 或 `--config <path>` 覆盖（测试 / 高级用法）。写入是原子写
（临时文件 + rename），损坏文件只告警不阻塞启动。

### 5. 两种形态 + 自动回退

`npm start` 默认托盘模式；`--headless` / `--no-tray` / `HEADLESS=1` 无头模式
（行为同改造前，不创建托盘、不生成 `config.json`）。托盘初始化失败（无桌面、
二进制缺失）自动回退无头模式。托盘进程被外部杀死时服务一并关闭，不留无 UI 的孤儿。

### 6. 端口配置 UX：快捷项 + 编辑文件

systray2 无文本输入框，所以「配置监听端口」用**常用端口快捷子菜单**（勾选即切并
持久化）+「打开配置文件」手改任意值 +「重新加载配置」生效。不做平台特异的弹窗
（PowerShell InputBox / xdialog 之类），保持单一跨平台路径。

### 7. 托盘模式启动时自动转入后台（detached）

托盘驻留的意义就是「不开终端运行」，因此 `npm start` 若发现自己是挂在真实终端上的
（`process.stdout.isTTY`），就重新 `spawn` 一个 **detached** 的自己、把标准输出重定向到
应用目录的 `tts-relay.log`、然后退出当前进程。此后关闭终端不再影响服务：POSIX 下子进程
进入新会话（setsid，脱离控制终端的 SIGHUP），Windows 下子进程位于新进程组
（CTRL_CLOSE_EVENT 不波及——已实机验证：同一控制台的父进程被 CTRL_CLOSE 杀死，
detached 子进程继续运行）。无头模式不后台化（交给 systemd / docker 等进程管理器）；
`RELAY_DETACHED=1` 标记子进程避免重复拉起，`--foreground` 供调试保持前台。

### 8. 菜单刷新必须逐项 `update-item`（`update-menu` 只更新顶层）

实测确认（Windows，systray2@2.1.4 的 Go 二进制）：`update-menu` 动作**只应用顶层菜单字段**
（`title` / `tooltip` / `icon`），**不会重绘菜单项**的标题 / 勾选 / 可用性。最初 `refresh()`
只发 `update-menu`，导致菜单永远停在创建时的状态（如「未监听 / 开启监听」），
而服务实际已在监听——用户点击「开启监听」命中运行时的「已在监听直接返回」，
没有状态变化、没有刷新，**表现为「点击监听毫无反应」**。

修法：`refresh()` 改为对每个菜单项算指纹（`title|checked|enabled`，见
`menu.signatureOf`），与上次渲染快照比对，**只对变化的项发 `update-item`**
（`menu.itemsToUpdate`）；顶层 `tooltip` 变化才发 `update-menu`。指纹快照在托盘
`ready()` 后按初始菜单建立基线。`update-item` 对叶子项与子菜单项都有效，
更新勾选与标题均不造成子项重复（已验证：端口子菜单 8 项更新后仍是 8 项）。

这是 systray2 / getlantern 一族的隐性协议行为，`tray/relay-tray.ts` 的 `refresh()`
与 `menu.ts` 的 `itemsToUpdate` 注释里也写了，改这两处前必读。

## 结果

- 正面影响：桌面用户双击即驻留，地址 / 状态 / 开关 / 常用配置全在右键菜单，配置落盘
  可跨重启复用；启动即后台化，关闭终端不中断服务；服务器部署零影响；新增
  `test/tray.smoke.js` 覆盖菜单结构、配置优先级、运行时启停与热更新、托盘点击派发与
  后台化判断（无 GUI 即可跑，已并入 `npm test`）。
- 代价 / 风险：
  - 新增运行时依赖 `systray2`（及其传递依赖 `debug` / `fs-extra`），带来三平台
    预编译二进制（约几 MB）；
  - 托盘菜单能力受限（无输入框、无通知），端口等「非常用值」需编辑文件；
  - 菜单刷新依赖 systray2 的 `update-item` 逐项重绘（决策 8）。这是实测得到的
    隐性协议行为，库未在类型或文档中明说，升级 systray2 时必须回归「状态变化后
    菜单是否真的更新」；
  - `config.json` 的键（`RelayConfig` 的 camelCase 字段）成为**面向用户数据的对外
    契约**（见 AGENTS.md §1.2），未来改键名要做迁移。
- 触发重评估的条件：
  - systray2 二进制在某平台 / 某 Node 版本不可用，或改用 Node SEA / pkg 打包后托盘
    子进程路径失效；
  - 需要富配置 UI（任意端口输入、滑杆、通知）时，应评估改为本地配置页或 Tauri 形态，
    并删除本 ADR 的「快捷项 + 编辑文件」折中；
  - `config.json` 需要演进时（加字段 / 改键名），在此补迁移说明。

## 反向链接

- `AGENTS.md` §1.1（决策日志新增「tts-relay 托盘 UI 层」行）、§1.2（`config.json`
  键名列为【对外】契约）、§3（`tts-relay/**` 改动验证命令）
- `tts-relay/README.md`（托盘模式 / 配置优先级 / 无头模式）
- `docs/tech-debt.md` TD-013（托盘无法直接输入任意端口）
