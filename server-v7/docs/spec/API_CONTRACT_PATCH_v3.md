# API_CONTRACT.md 增补 patch v3

> **来源**:TV 窗口 Q2 决策(创始人确认 2026-04-22)
> **优先级**:P0(批次 4 实现 dialogue 时必须按这个走)
> **白名单合规**:不破坏现有契约,仅新增可选字段
> **变更面**:`POST /api/story/dialogue/:id/turn` 增加可选字段 audioBase64

---

## 背景

TV 端为 GP15 投影仪儿童产品,孩子按语音键说话。原契约是两步走:

```
1. POST /api/asr/upload (multipart) → { text }
2. POST /api/story/dialogue/:id/turn { round, userInput: text } → next question
```

**问题**:7 轮对话累计多 7 次 HTTP 往返,每次 ~150-200ms,
对儿童投影仪场景"等待感"影响显著(累计 1+ 秒延迟)。

**优化**:允许 TV 端直接把 base64 audio 塞进 dialogue/turn,
服务端内部做 ASR + 对话生成,**省一次往返**。

---

## 操作 1:修改 §7.3 `POST /api/story/dialogue/:id/turn`

### 定位

`API_CONTRACT.md` §7.3 的 Request 类型定义。

### 修改 Request 类型

**原**(向后兼容,保留):
```ts
interface DialogueTurnRequest {
  round: number;          // 当前轮次,1-7
  userInput: string;      // 孩子的回答(已 ASR 后的文本)
  locale: Locale;
}
```

**改为**(增加 audioBase64,userInput 改为可选):
```ts
interface DialogueTurnRequest {
  round: number;             // 当前轮次,1-7
  userInput?: string;        // 孩子回答的文本(已 ASR 后)。
                             // 如果传了 audioBase64,本字段忽略
  audioBase64?: string;      // 孩子语音的 base64 编码(MP3/WAV/OGG)。
                             // 如果传了,服务端内部做 ASR,然后走对话流程。
                             // 至少 userInput 和 audioBase64 二选一,都没传 → 90001
  audioMimeType?: string;    // 当 audioBase64 存在时必填,如 'audio/mpeg'/'audio/wav'/'audio/ogg'
  locale: Locale;
}
```

### 修改业务逻辑描述

在 §7.3 的"业务规则"段加一条:

```markdown
- **二选一原则**:request body 必须包含 `userInput` 或 `audioBase64`,
  都没传返回 90001 PARAM_MISSING。
- **优先级**:同时传了两个时,以 `audioBase64` 为准(忽略 `userInput`)。
- **服务端实现**:收到 `audioBase64` 后,先调内部 ASR(等价于
  `POST /api/asr/upload`),拿到 text 后走原对话流程;ASR 失败返回 30011 ASR_FAILED。
- **响应字段**:Response 增加一个可选字段 `recognizedText: string`,
  当走 base64 路径时回传识别后的文本(给 TV 端可选展示"我听到的是 xxx")。
```

### 修改 Response 类型

**原**:
```ts
interface DialogueTurnResponse {
  round: number;
  nextQuestion: { text: string; ... };
  // ...
}
```

**改为**(只加一个可选字段):
```ts
interface DialogueTurnResponse {
  round: number;
  nextQuestion: { text: string; ... };
  recognizedText?: string;   // 仅当请求传了 audioBase64 时返回,是 ASR 结果。
                             // TV 端可选展示"我听到的是 xxx"给孩子确认
  // ...
}
```

### 错误码无需新增

- 已有 `30011 ASR_FAILED` 覆盖 ASR 失败
- 已有 `90001 PARAM_MISSING` 覆盖 userInput / audioBase64 都没传

---

## 操作 2:`/api/asr/upload` 接口保留(给 H5 用)

H5 端可能有别的场景需要单独 ASR(比如让家长试听孩子录音),
所以 `POST /api/asr/upload` 接口**保留不动**,仅 dialogue 流程多了内嵌 ASR 路径。

---

## 操作 3:在变更历史追加一行

`API_CONTRACT.md` 末尾的"变更历史":

```markdown
| v1.2 | 2026-04-22 | dialogue/turn 增加 audioBase64 字段(可选);response 增加 recognizedText |
```

---

## 服务端实现备忘(给批次 4 窗口)

实现 `/api/story/dialogue/:id/turn` 时:

```js
// 伪代码示意
const { round, userInput, audioBase64, audioMimeType, locale } = req.body;

if (!userInput && !audioBase64) {
  throw new BizError(ErrorCodes.PARAM_MISSING, {
    details: { reason: 'either userInput or audioBase64 required' }
  });
}

let text = userInput;
let recognizedText = null;

if (audioBase64) {
  // 内部调 ASR(可复用 services/asr.js)
  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    text = await asrService.transcribe(buffer, audioMimeType, locale);
    recognizedText = text;
  } catch (err) {
    throw new BizError(ErrorCodes.ASR_FAILED, { cause: err.message });
  }
}

// 走原对话流程,text 是孩子的输入
const nextQuestion = await llmService.generateNextQuestion(...);

return {
  round,
  nextQuestion,
  ...(recognizedText && { recognizedText }),
};
```

---

## 校验清单

贴完之后建议自查:

- [ ] §7.3 DialogueTurnRequest 多了 `audioBase64?: string` 和 `audioMimeType?: string`
- [ ] §7.3 DialogueTurnResponse 多了 `recognizedText?: string`
- [ ] §7.3 业务规则段说明了二选一原则、优先级、服务端 ASR 内嵌
- [ ] 没有动 §7.3 之外的任何接口
- [ ] §十五 变更历史加了 v1.2 一行

## 同步知会

- ✅ TV 窗口已知道(本 patch 即结果)
- ✅ 服务端窗口将通过 `docs/CHANGELOG.md` 知道(批次 4 实现时按这个走)
- ⚠️  H5 窗口:H5 不直接用 dialogue 接口,无影响
