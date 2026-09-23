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
npm start          # 监听 http://127.0.0.1:8787
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
  config/        环境变量（端点 / 并发 / 鉴权 / TTL 可切换）
  engines/edge/  Edge 引擎：令牌 / 文本预处理 / SSML / 帧编解码 / WSS 客户端 / 音色目录
  api/           HTTP 三个端点 + Bearer 鉴权 + 统一错误码
  queue/         per-client 并发上限 + 限流（自保）
  index.ts       启动入口
```

**部署形态**：无状态 + 可水平扩展。合成是「每段一条短连接」，进程内只需令牌的
窗口级 TTL 缓存，**无需长连接池**。多副本 + 负载均衡即分布式；要更高可用，
可让扩展配置多个地址做故障转移（v2）。
