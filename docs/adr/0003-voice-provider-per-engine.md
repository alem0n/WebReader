# ADR-0003 —— 音色提供方架构：每个引擎独立提供音色选项

- **状态**：采纳
- **日期**：2026-09-26
- **取代**：无（演进 ADR 0002 的音色加载链路；ADR 0002 的「默认音色按界面语言派生」
  语义不变）

## 背景

`getPresetVoices` 消息处理器的音色路由是内联 if/else：`mimo` 返回常量
`MIMO_PRESET_VOICES`，`relay` 调 `handleRelayVoices()`。随引擎增加，这段分支会
持续膨胀，且「这个引擎有哪些音色」的领域知识散落在消息处理器与各模块之间。

与此同时，合成侧（`ttsSpeech`）早已按引擎拆成独立模块（`background/tts.ts` /
`background/relay-tts.ts`），音色提供却没有对称抽象——两条链路的可维护性不对等。

## 决策

在 background 引入 **VoiceProvider 接口**，每个引擎独立实现「提供音色选项」：

```
src/background/voices/
  voice-provider.ts   接口 { provider, getVoices() } + 注册表
  mimo-voices.ts      MiMo：本地常量目录
  relay-voices.ts     relay：透传后端 /v1/voices（自 relay-tts.ts 迁入）
  index.ts            注册 + 导出 getVoiceProviderOrFallback
```

`getPresetVoices` 处理器收敛为按 provider 派发：

```ts
const voiceProvider = getVoiceProviderOrFallback(provider);
const result = await voiceProvider.getVoices();
```

**消息契约保持不变**：界面层仍只发 `getPresetVoices` 一个消息，响应形状不变，
popup / content 调用点零改动（§1.2【内部】契约的稳定性带来的是接口内部重构）。

**默认音色由目录顺序承载**：`pickDefaultVoice` 无匹配语种时回退目录首个，各
provider 把该引擎的默认音色排在首位（MiMo 首项是 `mimo_default` 双语音色）。
这取代了原先在共享层查找 `mimo_default` 的逻辑——引擎专属知识不再泄漏进
`shared/`，且对 MiMo 固定目录而言两者等价。

## 为什么不做更多

考虑过给接口加 `getDefaultVoice(voices, locale)` 方法（各引擎自定义兜底策略），
**但未采纳**：它没有真实调用方——界面层需要默认音色却不能 import background
模块（§6 分层），background 合成时界面已选好音色也不需要它。这属于推测性抽象
（§0 原则 1：抽象延迟到第二个真实用例出现）。目录顺序承载默认音色已足够，且
`pickDefaultVoice` 的回退天然对所有引擎成立。

## 代价

- relay 的音色加载逻辑从 `relay-tts.ts` 迁到 `voices/relay-voices.ts`，
  `relay-tts.ts` 只保留合成职责（原则 10：删除旧实现，不留兼容层）；
- 目录首个音色隐含「默认音色」语义，新增 provider 时须把默认音色排在首位
  （已在接口与 `pickDefaultVoice` 注释中写明此不变式）。

## 收益

- **开闭原则**：新增引擎 = 新增一个 provider 模块 + 注册一行，消息处理器与
  界面层均不变；
- 音色提供与合成正交，各自演进，两层结构对称；
- 引擎专属知识（MiMo 的 `mimo_default` 兜底）下沉到 provider，共享层只保留
  「界面语言 → 主语言前缀匹配 + 目录首个回退」的通用逻辑。

## 验证

- `test/voice-providers.smoke.mjs`（6 例）：MiMo 本地目录 / relay 透传与错误
  分支 / 注册表路由与回退 / `pickDefaultVoice` 回退语义；
- `test/click-jump-integration.smoke.mjs` 已同步更新回退断言（9/9）；
- `npm run verify` 通过，全部冒烟测试绿灯。

## 何时重新评估

- 出现第三个引擎且其默认音色无法用「目录首个」表达时，重新考虑
  `getDefaultVoice` 方法（届时它有了第二个真实用例）；
- 若界面层需要展示「当前引擎推荐音色」等场景，接口可按需扩展。
