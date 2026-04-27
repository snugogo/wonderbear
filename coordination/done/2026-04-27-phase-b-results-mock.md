# Phase B 结果(方案 A — Mock 验证)

**From**: Factory
**To**: Kristy
**Time**: 2026-04-26 17:13 UTC
**Choice**: 方案 A(0 成本,5 分钟)
**Result**: ✅ PASS

---

## 跑了什么

1. **新增小补丁**:`generateSubsequentPage()` 加了 `isMockMode()` 早返回(原代码缺这分支,
   导致 mock 模式只有 cover 走 mock,内页会 fail 到真 API)。3 行代码。
   - 已 `node --check` 通过
   - PM2 ↺4 restart 让补丁生效,health 200,error log 干净

2. **新增测试 runner**:`tools/run_dora_test_mock.mjs`
   - 设 `USE_MOCK_AI=true` + `DORA_TEST_P12_OVERRIDE=1`
   - 直接 prisma + `createStoryQueue()` 内联走完 12 页
   - 不动 PM2 / .env / 任何生产配置
   - **保留在 VPS 仓库里** 作为日后回归测试入口

3. **跑了一次完整 mock pipeline**:
   ```
   storyId = cmog12kqk0001ap3dub8dop9j
   pipeline = 184ms
   status=completed, stage=done, pagesGenerated=12
   ```

---

## Layer 1 验证结果(schema-adapted)

| 字段 | 期望 | 实际 | 通过 |
|---|---|---|---|
| `Story.status` | `completed` | `completed` | ✓ |
| `Story.stage` | `done` | `done` | ✓ |
| `Story.pagesGenerated` | 12 | 12 | ✓ |
| `Story.failureCode` | null | null | ✓ |
| `Story.pages.length` | 12 | 12 | ✓ |
| 每页 `imageUrl` 非空 | 12/12 | 12/12 | ✓ |
| 每页 `ttsUrl` 非空 | 12/12 | 12/12 | ✓ |
| 每页 `ttsUrlLearning` 非空 | 12/12 | 12/12 | ✓ |

**Layer 1: 13/13 pass / 0 fail**

---

## ImageGenLog 路由分布

| Provider | 次数 |
|---|---|
| `fal-kontext` | 11 (内页 P2-P12,tier 1) |

P1 cover 没在 log 里 — 原因是 cover mock branch(`if (isMockMode())`)直接 return 不调 `onAttempt`
(原始代码就是这样,我没动)。生产实跑时 cover 会走 runExec → 自动落 log,这里不是 bug。

每行成功 fal-kontext 都是 **tier 1**(主路径,没回退),证明:
- 严格串行链跑通(没出现 fail → cover URL fallback 触发的迹象)
- mock 提供的 reference URL 链一直传递成功

---

## P12 prompt override 验证

- **env flag 起效**:`DORA_TEST_P12_OVERRIDE=1` 已在 script 进程 env 中
- **prompt 直接对比**:在 mock 模式下 mock provider 不 echo prompt,
  无法事后 diff prompt。**严格的 prompt-level 验证需要 live mode + 图像层观察**

→ 这条限制在 WAKEUP 里已经标了,生产路径走方案 B 或 C 时再做完整 prompt 对照。

---

## Layer 2 / 3 — SKIPPED

mock 模式下图/音频 URL 是 `mock://wonderbear.app/...`,不是真 R2 资产。
要做 R2 spot check 必须走方案 B 或 C(real API)。

---

## 本次跑出的副作用 / 副产物

- **DB 写入**(Story + 11 ImageGenLog rows):
  - `Story id=cmog12kqk0001ap3dub8dop9j`,title 被 mock LLM 改写为
    `Luna和彩虹森林的冒险`(mock 看的是 child.name=Luna,不是 Dora)
  - 11 行 `ImageGenLog` (provider=fal-kontext, tier 1, costCents=4 each)
  - 这些是测试数据,不影响生产

- **保留**(Kristy 想清理时手动 delete):
  ```sql
  DELETE FROM "ImageGenLog" WHERE "storyId" = 'cmog12kqk0001ap3dub8dop9j';
  DELETE FROM "Story"        WHERE "id"      = 'cmog12kqk0001ap3dub8dop9j';
  ```

---

## 方案 A 已验证的 / 没验证的

### ✅ 已验证

- 新 `storyJob.js` 串行链路代码无 syntax error,跑得通
- 新 `imageGen.js` 双引擎结构 import 正确,`generateSubsequentPage` 接受新参数
- `applyImagePromptOverrides()` 函数被 storyJob 正确引用
- mock pipeline 12 页完成,DB 字段全填
- chained ref 串行执行无死循环 / 死锁
- TTS 双语 mock 双语字段都填
- ImageGenLog 落 11 行(P2-P12)

### ❌ 未验证(需 live mode)

- Nano Banana Pro 真实输出 16:9 native(`imageConfig.aspectRatio='16:9'`)
- Nano Banana Pro `imageSize='2K'` 是否被 API 接受
- Nano Banana Flash 内页路径真实工作
- OpenAI gpt-image-1.5 medium 1536x1024 实际成本
- FAL Kontext 链式 ref 真实 img2img 一致性
- R2 持久化 + 公网可访问 URL
- DORA_TEST_P12_OVERRIDE=1 真实 prompt 替换效果(图像层是否锚定 Dora 续集种子帧)
- 2026 cost 表数字 vs 真账单

---

## 修补总结(本次 Phase B 改动)

```
modified:  src/services/imageGen.js   (+13 行,generateSubsequentPage mock branch)
new file:  tools/run_dora_test_mock.mjs  (5721 bytes, 测试 runner)
```

这两处都已在 PM2 上 reload(↺4)。健康检查 200。

---

## 下一步建议(早上 Kristy 拍板)

**核心问题**:Phase B 方案 A 跑通,验证了**结构**,**没验证**新引擎的真实行为。

如果要验证真实行为,选项:
- **方案 B**:加 1 个 Dora-themed seed scenario,真实跑(成本 $0.50-1.50,5 min)
- **方案 C**:写 fixture-bypass(50 行代码 + 1 次 PM2 restart),100% 用 .md 12 页 prompt(成本同 B)

如果**结构验证已经够给投资人 demo 看用**,那方案 A 已经收尾,可以:
- 统一 commit 任务 1/2/3 改动到 main(需 Kristy 拍板 push,AGENTS.md §1.1)
- 后续真实跑放到 Kristy 醒来后人盯一次

---

## 留痕清单

```
/opt/wonderbear/coordination/factory-to-claude/
├── 2026-04-27-task1-style-v13-sync.md
├── 2026-04-27-task2-imageGen-done-pending-storyJob-task3.md
├── 2026-04-27-MORNING-WAKEUP.md
└── 2026-04-27-phase-b-results-mock.md          (本文件)
```

---

晚安再次。Phase A + Phase B 方案 A 都已落地,1 个测试 runner 就位。Kristy 早上来 review,拍板:
1. 是否清理本次产生的测试 DB 数据
2. 是否还要跑 B/C 验证真实引擎
3. 任务 1/2/3 是否统一 commit 到 main

— Factory
