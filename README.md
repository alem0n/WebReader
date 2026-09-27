# WebReader

浏览器网页朗读扩展（Chrome MV3）：把网页正文、选中文字或粘贴的文本转成语音朗读，
提供 MiMo TTS 与自部署 Edge 中转两条语音链路，并具备本地音色容灾。

> **浏览器兼容性**：本项目**仅在 Chrome 上测试过**，未在 Edge / Firefox / Safari 等
> 其他浏览器上测试，不保证其可用性。使用的是 Chrome MV3 清单与 `chrome.*` API。

## 功能

### 朗读方式

- **整页朗读**：自动采集网页正文（块级遍历，过滤导航 / 广告 / 脚本等干扰块）并逐句朗读；
  采集不到正文（如 Google Docs 被遮挡）时会引导改用「粘贴并朗读」；
  兼容 kiss-translator「仅译文」模式——原文被隐藏时改为采集页面可见的译文
- **选中朗读**：划词后弹出绿色朗读按钮，点击即可朗读选中文字（按钮跟随光标抬起位置）
- **右键菜单「朗读选中文字」**：选中文字后右键直接朗读（浏览器内部页面无此菜单）
- **粘贴并朗读**：把任意文本粘贴进悬浮窗文本框朗读（自动去 HTML 标签与方括号内容）
- **整页悬浮按钮**：页面边缘的「朗读整页」悬浮按钮，支持拖动与边缘吸附

### 语音引擎

- **MiMo TTS**（`mimo-v2.5-tts`，默认链路）：API Key 在主界面配置，预置多组中文 / 英文音色
- **后端中转（Edge 语音）**：在主界面「后端中转」面板填写自部署的中转后端地址即可改用
  Edge 语音。扩展端始终是纯 HTTP 短连接，Edge 的 WebSocket 私有协议、`Sec-MS-GEC`
  令牌与端点漂移全部吸收在后端（配套项目 `tts-relay/`，同仓库管理）。两条链路可随时
  切换，音色目录随之切换且互不污染缓存
- **本地音色容灾**：未配置 MiMo API Key 或合成失败（网络波动 / Key 失效）时，自动切换到
  浏览器内置 `speechSynthesis` 本地音色继续朗读，状态栏会提示当前为本地音色；
  停止后重新播放会自动重试 MiMo

### 朗读体验

- **音色选择与搜索**：音色下拉框支持按名称过滤；界面语言切换时音色名同步翻译
- **默认音色跟随界面语言**：未手动选择音色时，按当前界面语言（中 / 英）自动选用对应默认音色；手动选择的音色持久保存，不会被界面语言切换覆盖
- **语速控制**：0.5x – 2.5x，步长 0.1
- **「删除括号内容」开关**：朗读前删除括号及其中的内容（支持中英文圆 / 方 / 花括号，可嵌套，默认开）
- **网页内逐句高亮**：整页朗读时在网页原位高亮正在朗读的句子，原文一字不改（默认开）
- **朗读时自动滚动**：把高亮句带到视口中部，关闭后只高亮、不动浏览器滚动条
- **悬停预览 + 点击跳转**：鼠标悬停某句显示与「正在朗读」一致的高亮（纯 CSS），
  点击该句朗读立即跳过去并从此处继续播放（链接 / 按钮 / 修饰键 / 拖选自动放行，不劫持页面交互）
- **Web Audio API 播放**：绕过页面 CSP 对 blob 媒体的拦截

### 界面

- **扩展弹窗（主界面）**：音色 / 语速 / 开关列、API Key 与后端中转配置、provider 切换；
  标题栏统一承载悬浮窗开关、界面语言（中 / EN）与主题（亮 / 暗）切换
- **网页悬浮窗**：Shadow DOM 隔离，支持拖拽与最小化；界面语言与主题跟随主界面配置，
  悬浮窗不再单独提供切换入口
- **中 / 英双语界面**（`_locales` 仅保留 en / zh_CN）

## 安装与使用

1. 构建产物在 `dist/` 目录（见下文「开发与构建」）
2. 打开 `chrome://extensions` → 开启右上角「开发者模式」
3. 点击「加载已解包的扩展程序」→ 选择项目的 `dist` 目录
4. 使用方式：
   - 点浏览器工具栏的 WebReader 图标打开主界面
   - 在网页上划词后点绿色按钮「选中朗读」，或点页面边缘悬浮按钮「朗读整页」
   - 选中文字后右键 → 「朗读选中文字」
   - 首次使用需在主界面填写 MiMo API Key（[获取地址](https://platform.xiaomimimo.com/console/api-keys)）；
     不填也可先用本地音色容灾体验

## 开发与构建

```bash
npm install                # 安装依赖
npm run typecheck          # 类型检查（strict 全项，要求 0 错误）
npm run build              # 构建（输出到 dist/）
npm run verify             # typecheck + build，交付前一键验证
npm run format             # prettier 写入
npm run format:check       # prettier 只检查（CI 用）
npm run watch              # 监听重建

# 后端中转服务（tts-relay/，独立 npm 项目）
npm run verify:relay           # typecheck + build + 单测
npm --prefix tts-relay start    # 启动：node tts-relay/dist/index.js（默认 127.0.0.1:8787）

# 扩展 + 后端一键验证
npm run verify:all
```

项目启用 TypeScript 全部严格选项（`strict`、`noImplicitAny`、`strictNullChecks`、
`useUnknownInCatchVariables`、`noUnusedLocals` / `noUnusedParameters`）。

## 项目结构

```
ReadAloud-MiMo-TS/
├── public/          # 静态资源（原样复制到 dist）：manifest / popup.html + 7 个 popup-*.css / icons / _locales
├── src/
│   ├── shared/      # 三端共享：类型 / 常量 / 消息封装 / TTS / 音频缓存 / 默认音色派生 / 设置存储
│   ├── background/  # Service Worker：MiMo 代理 + 中转客户端 + API Key 管理 + i18n
│   ├── popup/       # 主界面（扩展弹窗）：状态 / 界面 / 播放 / 音色 / 设置 / 配置面板
│   └── content/     # 网页悬浮窗（Shadow DOM）：采集 / 播放 / 选中朗读 / 逐句高亮 / 悬浮按钮
├── tts-relay/       # 后端中转服务（Edge TTS，独立 npm 项目）
├── test/            # jsdom 冒烟测试（手动 node 运行）
├── esbuild.config.mjs   # 三入口构建 + public 复制
└── package.json
```

## 相关文档

- [AGENTS.md](./AGENTS.md) — 规则入口 / Git 工作流 / 验证要求 / 版本号（开发前必读）
- [RULES.md](./RULES.md) — 代码地图与各模块修改要点
- [DESIGN.md](./DESIGN.md) — 界面视觉设计基准（Duolingo 风格）
- [tts-relay/README.md](./tts-relay/README.md) — 后端中转服务部署与协议事实
