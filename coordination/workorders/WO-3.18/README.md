# WO-3.18 — GeneratingScreen 综合修复 + 草稿持久化

**版本:** 1.0
**派单时间:** 2026-05-01
**承接 Agent:** Factory V4 Pro
**预估时间:** 120-180 分钟(本工单是 V4 Pro 跑过的最大单)
**预估行数:** 500-650 行,4 个 Phase

---

## §scope

修复 5 项产品反馈(memory #21),按风险升序分 4 Phase 执行:

| Phase | 内容 | 风险 | 行数 |
|---|---|---|---|
| 1 | 文案修复 + hint 不遮挡 | 🟢 低 | ~30 |
| 2 | 进度条与小熊位置同步 | 🟡 中 | ~80 |
| 3 | 8 轮总结流程 + 按钮 + 状态机 | 🟠 中高 | ~200 |
| 4 | 草稿持久化(后端 + 前端 + 返回键确认) | 🔴 高 | ~250 |

**强制顺序:** Phase N 失败时不得开始 Phase N+1。每个 Phase 完成后写一行 `coordination/markers/WO-3.18/.phase-N-done`,这样若 Phase 4 跑挂,前 3 个 Phase 已落地,Kristy 浏览器实测能验收 75% 修复,WO-3.18.1 只补 Phase 4。

---

## §accept-test-url

`https://tv.bvtuber.com/`(主验收 URL,**不带 ?dev**)

验收路径:
1. 点 CREATE → 走完 8 轮对话 → 看是否出现"开始画故事"按钮(Phase 3)
2. 不点按钮等 30 秒 → 按钮应有动效持续 → 不自动开始(Phase 3)
3. 按返回键 → 弹"故事还没画,要保留吗?"(Phase 4)
4. 点保留回首页 → 再按 CREATE → 弹"上次聊了 N 轮,继续吗?"(Phase 4)
5. 进入 GeneratingScreen 看进度条与小熊位置(Phase 2)
6. 看 "Bear is painting your story" 文案(Phase 1)
7. hint "This takes a few minutes" 不遮挡进度条(Phase 1)

---

## §previous-wo-whitelist

WO-3.16 / WO-3.16.1 已改的文件,本工单可继续修改:
- `tv-html/src/screens/DialogueScreen.vue`(WO-3.11/3.16/3.16.1 的目标文件)
- `tv-html/src/screens/GeneratingScreen.vue`(WO-3.6 等的目标文件)

---

## §spillover-allowed

```
tv-html/src/screens/(DialogueScreen|GeneratingScreen|HomeScreen)\.vue
tv-html/src/components/.*\.(vue|ts)
tv-html/src/stores/.*\.ts
tv-html/src/i18n/locales/(zh|en)\.ts
tv-html/src/services/api\.ts
tv-html/src/router\.ts
server-v7/src/routes/draft\.js
server-v7/src/routes/index\.js
server-v7/prisma/schema\.prisma
server-v7/prisma/migrations/.*
```

---

## §execution

### Phase 1: 文案 + hint 不遮挡(风险🟢,先做)

**1A. 文案修复**

`tv-html/src/i18n/locales/en.ts`:
- 找 `Bear is recording` → 改成 `Bear is painting your story`
- (注释:这是回归 — 原本就是 painting,某次工单误改为 recording)

`tv-html/src/i18n/locales/zh.ts`:
- 找对应中文键 → 改成 `小熊正在画你的故事`

**1B. hint 不遮挡进度条**

`tv-html/src/screens/GeneratingScreen.vue`:
- 找 hint 文字"This takes a few minutes" / "需要几分钟" 的容器
- 调整 CSS:加 `margin-bottom: 24px` 或 `position: absolute; bottom: 80px`,确保不与进度条重叠
- 实测 1280×720 / 1920×1080 两种 viewport 下都不遮挡

**1C. 落地 marker**

```bash
mkdir -p /opt/wonderbear/coordination/markers/WO-3.18
touch /opt/wonderbear/coordination/markers/WO-3.18/.phase-1-done
```

---

### Phase 2: 进度条与小熊位置同源(风险🟡)

**取证:** 当前 GeneratingScreen.vue 里看小熊位置和进度条的两个状态变量,大概率是**两个独立的算法或时间函数**(比如小熊用 CSS animation 走时间,进度条用 progress 数字)。

**修复策略:** **物理同源** — 小熊位置作为进度条末端的子组件,共享同一个 progress 值。

```vue
<!-- 期望结构 -->
<div class="progress-track">
  <div class="progress-fill" :style="{width: progress + '%'}"></div>
  <img class="bear-runner" src="..." :style="{left: progress + '%'}" />
</div>
```

CSS 关键:`.bear-runner { position: absolute; transform: translateX(-50%); transition: left 0.3s; }`

progress 数值来自后端 SSE / 轮询,**不**用前端定时器估算(否则前后端进度脱节又会出问题)。

**Phase 2 marker:** `.phase-2-done`

---

### Phase 3: 8 轮总结 + 按钮 + 状态机(风险🟠)

**产品规格(Kristy 拍板版):**

```
对话状态机:
─────────────────────────────────────────────
ASKING (默认):正常对话(小熊问 → 孩子答)
              小熊由 LLM 自主判断,2-4 轮后认为故事够丰富时进入下一状态

WAITING_CONFIRM:小熊主动总结("我们来一起画一个 X 的故事吧?")
                屏幕底部弹出 [开始画故事] 按钮(带脉冲/呼吸动效)
                状态行为:
                ├─ 点击按钮 → 进入 GeneratingScreen 画图
                ├─ 按话筒说话 → 回到 ASKING(继续聊,LLM 再判断 2-4 轮后再总结)
                ├─ 按返回键 → 弹"故事还没画,要保留吗?"(Phase 4 接管)
                └─ 既不点也不说 → 永远停在这里,按钮持续动效
                                  ❌ 不超时
                                  ❌ 不自动开始
```

**LLM 总结触发(关键):**

修改 dialogue prompt(在 server-v7/src/routes/dialogue.js 或类似位置),加入指令:

```
你是 WonderBear,陪孩子聊天创作故事。
当你判断故事的主角、场景、冲突已经够丰富时(通常 2-4 轮对话后),
主动总结故事并询问孩子是否准备好画这个故事。
返回的 JSON 多加一个字段:
  "should_summarize": true | false,
  "story_summary": "我们来一起画一个 ... 的故事吧?"  (仅 should_summarize=true 时)

之后如果孩子又开始说话,说明他想继续聊,你回到正常对话模式。
再聊 2-4 轮后,基于新内容重新总结。
```

**TV 端状态机:**

`tv-html/src/screens/DialogueScreen.vue`:
- 加 ref `dialogueState: 'asking' | 'waiting_confirm'`
- 接到后端响应时检查 `should_summarize` → 切换到 `waiting_confirm`
- 用户按话筒说话 → 切回 `asking`
- 按钮组件单独提取为 `<ConfirmCreateButton>`,带 keyframe 动效:

```css
@keyframes pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 200, 0, 0.7); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(255, 200, 0, 0); }
}
.confirm-button { animation: pulse 1.8s infinite; }
```

**Phase 3 marker:** `.phase-3-done`

---

### Phase 4: 草稿持久化(风险🔴,最后做)

**Step 4.1 — 取证(先看现状再设计)**

```bash
# 看 server-v7 有无 deviceId / installId 概念
grep -rn 'deviceId\|installId\|device_id\|install_id' server-v7/src --include='*.js' | head -20
grep -rn 'deviceId\|installId' tv-html/src --include='*.vue' --include='*.ts' | head -20
# 看 Prisma schema 现有 model
grep -A 20 'model.*{' server-v7/prisma/schema.prisma | head -100
```

把取证结果写到 `coordination/markers/WO-3.18/.phase-4-survey.txt`。**根据取证结果分支:**

| 取证发现 | 实施方案 |
|---|---|
| server 已有 `deviceId` 字段 | 草稿表关联 deviceId(完整持久化) |
| 已有 installId 或类似设备标识 | 用现有标识 |
| 完全无设备标识 | **降级到 localStorage** — 草稿存浏览器本地,后端不存(详见 Step 4.2b) |

**Step 4.2a — 后端持久化方案(deviceId 已有)**

`server-v7/prisma/schema.prisma` 新增:

```prisma
model StoryDraft {
  id                  Int      @id @default(autoincrement())
  deviceId            String   // 取证发现的设备标识字段名
  conversationHistory Json     // [{role: "bear"|"child", content: "...", timestamp}, ...]
  outlineSummary      String?  // 小熊最近一次总结(should_summarize=true 时的 story_summary)
  protagonistName     String?  // 用户口头说的主角名(WO-3.19 链路也用)
  turnCount           Int      @default(0)
  status              String   @default("waiting_confirm")  // waiting_confirm | abandoned
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  expiresAt           DateTime  // createdAt + 24h

  @@unique([deviceId, status])  // 同一设备同状态只能 1 条(单草稿覆盖)
  @@index([expiresAt])
}
```

⚠️ **migration 注意:** `npx prisma migrate dev --name wo_3_18_story_draft` 在 server-v7 目录跑。
**不要 push schema** — 用 migrate 生成可回滚的迁移。

`server-v7/src/routes/draft.js` 新增 API:

```javascript
// POST /api/draft — 保存/更新草稿(deviceId 关联,upsert)
// GET /api/draft/active?deviceId=X — 获取活跃草稿,过期自动返回 null
// DELETE /api/draft/:id — 删除草稿(用户取消或开始画图后)
```

`server-v7/src/routes/index.js`:加 `app.register(require('./draft'), { prefix: '/api/draft' })`

**Step 4.2b — 降级方案(无 deviceId)**

不改 schema,不加 API。改用前端 localStorage:

`tv-html/src/stores/draft.ts` 新增:

```typescript
const DRAFT_KEY = 'wonderbear:draft'
const DRAFT_TTL = 24 * 3600 * 1000  // 24h

export function saveDraft(data: DraftData) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    ...data,
    expiresAt: Date.now() + DRAFT_TTL
  }))
}

export function loadDraft(): DraftData | null {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return null
  const data = JSON.parse(raw)
  if (Date.now() > data.expiresAt) {
    localStorage.removeItem(DRAFT_KEY)
    return null
  }
  return data
}

export function clearDraft() { localStorage.removeItem(DRAFT_KEY) }
```

**Step 4.3 — TV 前端流程接入**

`tv-html/src/screens/HomeScreen.vue` 或 CREATE 入口:
- 按 CREATE → 调 `loadDraft()` (或 `GET /api/draft/active`)
- 有草稿 → 弹对话框"上次聊了 N 轮还没画,继续吗?"
  - [继续] → 跳到 DialogueScreen,store 读草稿恢复 conversation + state=waiting_confirm
  - [新故事] → clearDraft(),全新对话

`tv-html/src/screens/DialogueScreen.vue` waiting_confirm 状态:
- 按返回键拦截 → 弹对话框"故事还没画,要保留吗?"
  - [保留] → saveDraft(当前对话历史 + outline summary),回首页
  - [取消] → clearDraft(),回首页

用户点"开始画故事"按钮 → clearDraft() → 进入 GeneratingScreen

**Phase 4 marker:** `.phase-4-done`(Step 4.1 取证完先建,4.3 完成后才算 done)

---

## §verify

```bash
bash /opt/wonderbear/workorders/WO-3.18-verify.sh
```

verify 检查 4 个 Phase marker + 关键文件改动 + 文案 + npm build。详见 verify 脚本本身。

---

## §OUT-OF-SCOPE

1. ❌ **不修主角"Luna"问题** — 这是 WO-3.19 范围,本工单只做对话/UI/草稿
2. ❌ **不新建 deviceId 注册流程** — 取证发现没有就降级 localStorage,**不要主动设计 deviceId**
3. ❌ **不动 ASR/TTS provider 配置**
4. ❌ **不动 image generation 逻辑**
5. ❌ **不 git commit / push**(Kristy 手动)
6. ❌ **不写测试**(单元测试不在 scope,Kristy 浏览器实测验收)
7. ❌ 不修 OutlineScreen 的滚动条(WO-3.6 候选)

---

## §risk

### 🔴 Risk 1: Phase 4 太大跑不完

**缓解:** Phase 1-3 完成后**已经写 marker**,即使 Phase 4 失败,你浏览器实测可验收 75% 改动。完成报告里 V4 Pro 应明确标注"Phase 4 未完成,建议 WO-3.18.1"。

### 🔴 Risk 2: Prisma migration 失败

**缓解:**
- 在 server-v7 目录跑 `npx prisma migrate dev --name wo_3_18_story_draft`,**不要 `db push`**
- 跑 migration 前 backup PG:`docker exec wonderbear_postgres pg_dump -U wonderbear wonderbear_db > /tmp/db-backup-pre-wo-3.18.sql`
- migration 失败立即 rollback 文件 + 通知 Kristy 不要重启 server

### 🔴 Risk 3: 状态机改动导致对话流卡住

**缓解:**
- Phase 3 实施时**保留旧的"立即生成"路径**(避免 LLM 一直不返回 should_summarize 卡死)
- 加调试日志:`console.log('[DIALOGUE-STATE]', dialogueState, 'turn=', turnCount)`
- 浏览器实测时打开 console 看状态切换

### 🔴 Risk 4: 按钮动效 + 多语言文案 conflict

**缓解:** 文案只改 "Bear is painting your story",**不动现有按钮文案**(若按钮原本是"开始画故事"就用现有的,本工单不引入新文案 key)

### 🔴 Risk 5: 后端 schema 改动后 server 启动失败

**缓解:**
- migration 后 `pm2 restart wonderbear-server`,**等 30 秒** + `pm2 logs wonderbear-server --lines 30`
- 启动失败立即 `pm2 restart wonderbear-server` 复原(此时 Prisma client 仍是旧 schema,会报 type 错)
- 紧急回滚:`cd server-v7 && rm -rf prisma/migrations/<本工单 migration 目录> && npx prisma generate && pm2 restart wonderbear-server`

---

## §deliverables

完成报告 → `coordination/done/WO-3.18-report.md`,必须包含:

1. **Phase 完成情况:** 4 个 phase 各自是否完成(✅/❌/部分)
2. **Phase 1 文案改动:** zh.ts / en.ts 改动行号
3. **Phase 2 同源策略:** 进度条+小熊用同一 progress 值的 git diff 关键行
4. **Phase 3 状态机:** dialogueState 状态切换日志(Phase 3 完成后跑过一次完整对话流的 console 日志)
5. **Phase 4 取证结果:** deviceId 是否已存在,选了 4.2a 还是 4.2b 方案
6. **Phase 4 schema/API/前端:** 改动文件清单 + 行号
7. **风险出现情况:** 上述 5 个 risk 哪些触发了
8. **下一工单建议:** 实测后发现的新问题

---

## §previous-wo-files-allowed-to-modify

(供 verify-lib check_no_spillover 第二参数用,允许本工单继续改这些前置工单的文件)

```
tv-html/src/screens/DialogueScreen\.vue
tv-html/src/screens/GeneratingScreen\.vue
tv-html/src/screens/HomeScreen\.vue
tv-html/src/i18n/locales/zh\.ts
tv-html/src/i18n/locales/en\.ts
```
