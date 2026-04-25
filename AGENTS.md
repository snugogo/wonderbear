# AGENTS.md — WonderBear 项目协作规范

> 本文件是所有 AI 编码 Agent（Factory / Claude / Cursor / Codex 等）在本仓库工作时的**强制操作规范**。
> 工单中如果没有明确说明，默认遵守本文件所有规则。
> 维护人：Kristy（@snugogo）。最后更新：2026-04-25。

---

## 1. 成本纪律（最高优先级）

### 1.1 触发预算审批的操作

以下操作**必须先报预算 → 等 Kristy 批准 → 再执行**：

- 调用付费 API 的**批量任务**（≥5 次连续调用，或单次预估成本 ≥ $0.50）
- 任何包含 "seed"、"probe"、"stress test"、"压测"、"种子数据"、"全链路验证"字样的任务
- 任何启用 `DEBUG_FORCE_*` 类强制失败标志的测试
- 跑通新的 pipeline 端到端流程（哪怕只跑1次）

### 1.2 报预算模板

执行前在对话窗口发送：

```
【预算申请】
任务：<任务名>
预估调用：
  - <API名> × <次数> × <单价> = $<小计>
  - <API名> × <次数> × <单价> = $<小计>
预估总成本：$<总额>
预估时长：<分钟>
请 Kristy 批准（回复"批准"或"调整"）。
```

**没收到"批准"两个字，不能开跑。**

### 1.3 跑完后强制报账

任务结束后，主动在对话窗口发送：

```
【实际消耗】
任务：<任务名>
实际调用：
  - <API名>: <次数>次, $<小计>
  - <API名>: <次数>次, $<小计>
实际总成本：$<总额>
对比预估：$<总额> vs 预估 $<预估额>（偏差 <百分比>%）
异常说明：<如果偏差 >20% 必须解释原因>
```

### 1.4 默认禁用的危险操作

VPS 上以下环境变量**默认不设置**，需要 Kristy 手动开启才能跑：

- `ALLOW_EXPENSIVE_OPS=true` — 解锁种子生成、批量回归测试
- `DEBUG_FORCE_OPENAI_FAIL=true` — 解锁 OpenAI 强制失败压测
- `DEBUG_FORCE_KONTEXT_FAIL=true` — 解锁 FAL kontext 强制失败压测

任何使用上述变量的脚本，启动时**必须打印警告**：

```javascript
if (env.DEBUG_FORCE_OPENAI_FAIL) {
  console.warn('⚠️  WARNING: DEBUG_FORCE_OPENAI_FAIL is ON.');
  console.warn('⚠️  Every Page 1 call will trigger full fallback chain (3-4x normal cost).');
  console.warn('⚠️  Estimated cost per story: $0.45 → $1.50+');
}
```

---

## 2. 产出可见性（同样关键）

### 2.1 任何生成图片/音频/文档的任务，必须输出**可访问的查看入口**

跑完后报告里必须包含：

- **直接可访问的URL**（HTTP链接，不是服务器路径）
- **缩略图预览**（如果是图片，最少给5张缩略图URL）
- **数据库记录ID**（让 Kristy 能用 SQL 自查）

### 2.2 图片产出归档规范

所有生成的图片必须满足以下其中一种存储方式：

**方式A（推荐）：写入 R2 / OSS**
- 路径：`https://cdn.wonderbear.app/generated/<storyId>/<pageNum>.webp`
- 直接浏览器打开即可看

**方式B（临时方案）：写入 VPS 静态目录**
- 路径：`/var/www/wonderbear-debug/<storyId>/<pageNum>.webp`
- Nginx 暴露 `https://154.217.234.241/debug/<storyId>/`
- **必须设密码保护**

**禁止**：
- ❌ 图片只存 base64 dataURL 在数据库里（Kristy 看不到）
- ❌ 图片只存在 `/tmp/`（重启即丢）
- ❌ 图片只通过 API 第三方临时URL返回（FAL/OpenAI 临时URL 1-24小时就失效）

### 2.3 任务完成后必须给 Kristy 的产出清单

```
【产出清单】
任务：<任务名>
- 数据库记录：Story.id IN (<id1>, <id2>, ...)
- 图片预览：
  - 故事1封面: https://...
  - 故事1第2页: https://...
  - （至少5张缩略图）
- 完整查看：https://<访问入口>/stories/<id>
- ImageGenLog 表：SELECT * FROM image_gen_log WHERE story_id IN (...)
```

---

## 3. Git 操作规范

- 所有改动通过 PR/分支提交，**不直接 push 到 main**
- Push 前必须等 Kristy 明确说"可以push"
- 提交信息格式：`<type>(<scope>): <description>`，type 用 feat/fix/chore/probe/seed/refactor/docs

---

## 4. 测试和压测的隔离

### 4.1 单元测试 / smoke test
- 必须用 mock 模式（`USE_MOCK_AI=1`）
- 不允许在 CI 或自动化测试里调用真实付费API

### 4.2 真实API集成测试
- 必须显式标记为 `*-real.test.js` 或在文件名包含 `real`
- 必须遵守 §1 成本纪律
- 默认在 `package.json` 里**不挂到 `npm test`**，需要单独 `npm run test:real` 触发

---

## 5. 文档同步

- 修改了批次完成情况，必须同步更新 `server-v7/README.md` 的"批次进度表"
- 修改了 API 协议，必须同步更新 `server-v7/docs/spec/`
- 这两点不做就是技术债，下次交接窗口会出问题

---

## 6. 当规范和工单冲突时

- 工单可以**临时覆盖**本规范的某条规则，但必须**显式说明**："本任务豁免 §X.Y，原因：..."
- 没有明确豁免，本规范优先
- 如果工单和本规范冲突且没说明，**默认遵守本规范，并在执行前向 Kristy 确认**

---

**END OF AGENTS.md**
