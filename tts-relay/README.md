# tts-relay — WebReader 扩展的 TTS 中转后端

把 Edge TTS 的 **WSS 私有帧协议 + `Sec-MS-GEC` 令牌 + 端点漂移** 全部吸收在后端，
对 Chrome 扩展暴露普通的 **HTTP 短连接**。扩展端因此保持纯 HTTP 客户端形态，
微软一改协议 → 改一行常量、推一次容器，全平台立即修复，扩展完全无感。

> ⚠️ **合规与可用性边界**：Edge TTS 是**未公开、被逆向工程**的接口，无官方文档、
> 无 SLA、无保证的限流承诺；理论上违反微软服务条款，微软可在任何时候无预警掐断
> （2024 年改鉴权即导致全网依赖库断异数周）。**本服务把这一风险与扩展解耦**：
> 扩展本身不内置任何 Edge 协议，合规与可用性责任落在部署者。若需稳定 / 商用路径，
> `api.msedgeservices.com/tts/cognitiveservices` 背后就是正版 Azure 认知服务，
> 应改用 Azure 密钥链路（可作为 `engines/azure` 复用同一 SSML 能力）。

## 协议事实基准

全部来自 `edge-tts@7.2.8` 源码 + 2026-09-22 实测，见 `src/engines/edge/`。

| 项 | 值 |
| --- | --- |
| 合成 WSS（权威） | `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4` |
| 音色列表 | `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=...` |
| 备选端点 | `api.msedgeservices.com`（微软迁移中，`EDGE_ENDPOINT=msedgeservices` 切换） |
| 令牌 | `SHA256( str(ticks) + TrustedClientToken )` 大写 hex；ticks = 5 分钟窗口对齐的 Windows 100ns 刻度 |
| 握手必需头 | `Cookie: muid=<16字节hex>;` + Edge `User-Agent` + `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold` + permessage-deflate |
| 二进制帧载荷 | 起点恰在 `2 + 头长度`（不是 `2 + H + 2`） |

## 快速开始

```bash
npm install
npm run build      # tsc → dist/
npm start          # 托盘模式：驻留系统托盘，默认监听 http://127.0.0.1:8787
npm run start:headless   # 无头模式（服务器 / 容器部署，行为与改造前一致）
```

本地开发默认**不校验** Token（`RELAY_AUTH_TOKEN` 为空时放行）。生产部署务必设置：

```bash
PORT=8787
HOST=0.0.0.0                 # 生产建议反代后暴露 + 强制 https
RELAY_AUTH_TOKEN=<随机长串>  # 扩展端配置同一个 Token
EDGE_ENDPOINT=bing           # bing（权威）| msedgeservices（微软迁移时切换）
EDGE_CHROMIUM_VERSION=143.0.3650.75
EDGE_OUTPUT_FORMAT=audio-24khz-48kbitrate-mono-mp3
MAX_CONCURRENCY=4            # 全局并发上限
MAX_PER_CLIENT=2             # 单客户端并发上限（自保）
MAX_QUEUE_SIZE=64            # 排队上限，超出即拒绝
VOICES_TTL_MS=86400000       # 音色目录 TTL
SYNTH_TIMEOUT_MS=60000       # 单段空闲超时（两帧之间最大间隔）
```

## 托盘模式（桌面驻留）

`npm start`（或 `node dist/index.js`）默认进入托盘模式：**先把自己转入后台**（脱离启动它的
终端），再驻留为系统托盘图标，**右键菜单**提供常用操作，改动持久化到**可执行文件同目录的
`config.json`**：

| 菜单项 | 作用 |
| --- | --- |
| 状态行（置灰） | 实时显示监听地址 / 未监听 / 启动失败原因 |
| 开启 / 关闭监听 | 立即启停 HTTP 服务（不退出进程） |
| 监听地址 | 仅本机 `127.0.0.1` / 允许局域网 `0.0.0.0`，勾选即切 |
| 监听端口 | 常用端口快捷项，勾选即切并持久化 |
| Edge 端点 | `bing`（默认 / 权威）/ `msedgeservices`（备选） |
| 在浏览器中打开 / 复制监听地址 | 仅监听时可用 |
| 关于 | 版本、端点、上游音色数、配置文件路径 |
| 打开配置文件 | 用默认编辑器打开 `config.json`（不存在则先生成一份完整的） |
| 重新加载配置 | 手改 `config.json` 后用它生效（无需重启进程） |
| 退出 | 优雅关闭服务并退出 |

**配置来源优先级**：环境变量（显式设置）> `config.json` > 内置默认值。

- 托盘菜单的改动写入 `config.json`，并对当前会话立即生效（即使同名环境变量存在也以托盘为准，所见即所得）；
- 显式设置的环境变量在**进程启动时**始终覆盖文件（服务器 / 容器部署的旧用法不变）；
- 因此服务器 / 容器部署请用 `npm run start:headless`（`--headless` / `HEADLESS=1`），
  该模式不创建托盘、不生成 `config.json`，完全由环境变量驱动；
- 托盘不可用（无桌面、二进制缺失）时自动回退到无头模式，服务照常启动。

> 端口快捷项只列了常用值。**任意端口**请「打开配置文件」改 `port` 字段，
> 再点「重新加载配置」；其余字段（鉴权 Token、并发上限、TTL、输出格式……）同理。

**关闭终端不会退出程序**：托盘模式启动时会重新拉起一个脱离控制台的进程，随即退出当前
终端里的进程（POSIX 下进入新会话，Windows 下位于新进程组），此后关闭终端、甚至退出
当前 shell 都不影响运行。后台进程的输出写入与 `config.json` 同目录的 `tts-relay.log`
（超过 2MB 时自动轮转一份 `.old`）。调试需要看实时输出时加 `--foreground` 保持前台：
`npm start -- --foreground`。

## API

### `POST /v1/tts` — 合成

```jsonc
// 请求（Bearer 鉴权）
{ "text": "你好，世界。", "voice": "zh-CN-XiaoxiaoNeural", "speed": 1.5 }
```

```text
// 成功：200，直接返回原始音频字节（省 33% 流量）
Content-Type: audio/mpeg
```

```jsonc
// 失败：统一 JSON，错误码对齐扩展 TtsErrorResponse.code
{ "ok": false, "code": "UPSTREAM_AUTH", "message": "Edge 握手被拒（HTTP 403）：时钟偏差或令牌失效", "status": 401 }
```

### `GET /v1/voices` — 音色目录

```jsonc
{ "ok": true, "count": 322, "voices": [ { "name": "zh-CN-XiaoxiaoNeural", "voice": "zh-CN-XiaoxiaoNeural", "language": "zh-CN", "gender": "Female" } ] }
```

### `GET /v1/health` — 连通性自检（不需要鉴权）

```jsonc
{ "ok": true, "engines": ["edge"], "endpoint": "bing", "upstreamLatencyMs": 751, "voices": 322 }
```

上游不可达时仍返回 200 并带 `upstreamError`，供扩展端做**分级引导**：
权限未授予 / 后端不可达 / 后端起来但上游 403（再细分为时钟偏差、IP 或地区受限、端点漂移）。

## 错误码 → 扩展映射

| 后端 code | HTTP | 扩展映射 | 可重试 |
| --- | --- | --- | --- |
| `UPSTREAM_AUTH` | 401 | `NO_API_KEY`（统一可操作文案） | 否 |
| `BAD_REQUEST` | 400 | status=400 透传 | 否 |
| `RATE_LIMIT` | 429 | status=429 | 是 |
| `UPSTREAM_5XX` | 502 | status=5xx | 是 |
| `TIMEOUT` | 504 | `TIMEOUT` | 是 |
| `NETWORK` / `BAD_GATEWAY` | 502 | `NETWORK` | 是 |

## 目录结构

```
src/
  config/        配置定义 / 默认值 / 归一化（index.ts）+ 文件持久化与优先级（store.ts）
  engines/edge/  Edge 引擎：令牌 / 文本预处理 / SSML / 帧编解码 / WSS 客户端 / 音色目录
  api/           HTTP 三个端点 + Bearer 鉴权 + 统一错误码
  queue/         per-client 并发上限 + 限流（自保）
  runtime/       运行时：持有引擎 / 音色 / 队列 / HTTP 服务，start / stop / update / reload +
                 托盘模式后台化（detach.ts：脱离启动终端、输出转日志文件）
  tray/          托盘 UI：菜单构建（menu.ts）/ 点击派发（relay-tray.ts）/ 图标 / 桌面小操作
  index.ts       启动入口：托盘模式（默认）/ 无头模式 + 不可用时回退
```

**部署形态**：无状态 + 可水平扩展。合成是「每段一条短连接」，进程内只需令牌的
窗口级 TTL 缓存，**无需长连接池**。多副本 + 负载均衡即分布式；要更高可用，
可让扩展配置多个地址做故障转移（v2）。桌面驻留形态（托盘模式）是单实例的
便利封装，服务端能力与无头模式完全相同。
