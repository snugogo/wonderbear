# VPS Claude Orchestration README — 2026-04-28 夜班

**To**: VPS Claude (orchestrator)
**From**: Kristy + Local Claude
**派单时间**: 2026-04-28 北京晚间 (Kristy 准备睡觉)
**总目标**: **明早 Kristy 醒来打开 `localhost:5176` 能在 TV-HTML 演示完整 production 流程**, 主线全真数据, 附属屏界面对即可
**Kristy 状态**: **睡眠中**, 不可被打断 (无回复机制)
**本任务包路径**: `coordination/workorders/2026-04-28-tv-html-phase1-phase2/`
**报告归档路径**: `coordination/done/`
**异常打断路径**: `coordination/blockers/` (Kristy 醒后 git pull 即可看到)

---

## §0 通信协议 (重要 - 钉钉只能单向通知)

### 0.1 派单方向 (Kristy → VPS Claude)
- **唯一通道**: git 文件
- Kristy 把 workorder md 文件 push 到 fix/tv-gallery-v2 分支 `coordination/workorders/`
- VPS Claude 自己 git pull 拉到任务

### 0.2 报告方向 (VPS Claude → Kristy)
- **任务报告**: 写 md 到 `coordination/done/` + git commit + push (Kristy 醒后 git pull 看)
- **异常打断**: 写 md 到 `coordination/blockers/` + git commit + push (Kristy 醒后第一眼看)
- **状态通知 (钉钉)**: 单向推送, **仅用于让 Kristy 知道进度**, 不指望任何回复
  - 钉钉用途: 阶段开始 / 阶段完成 / 阶段失败 提醒
  - 钉钉**不可**用作派单通道, 不可用作问答通道

### 0.3 不可被打断
- Kristy 睡眠中, 任何"必须打断"的情况 → 写 `coordination/blockers/` md + git push + 钉钉单向通知
- VPS Claude 自己**自主决策**, 不要等 Kristy 回复
- 决策原则: 范围外的事一律停止, 写 blocker, 不要自作主张扩张

---

## §1 今晚两个任务包

| 顺序 | 文件 | 范围 | 预算 | 是否实跑付费 API |
|---|---|---|---|---|
| 1 | `2026-04-28-PHASE1-tv-html-server-read-integration.md` | Library + Story 播放 + Learning + Favorites + Create slot + Bear Stars Editor 真书跳转 | $0 | 否 (只读 GET, 免费) |
| 2 | `2026-04-28-PHASE2-tv-html-server-write-integration.md` | Dialogue + Generate + 录音 写链路代码接通 | $0 | **否** (代码接通不实跑) |

**严格串行**: PHASE1 验收过, 才能启动 PHASE2。PHASE1 失败立即停止整个夜班, 写 blocker md + git push + 钉钉通知, 不重试 PHASE 级别。

---

## §2 总原则 (违反 = 整个夜班作废, 全部回滚)

### 2.1 绝对禁止

- ❌ git push 到 `main` 分支 (commit + push 到 `fix/tv-gallery-v2` 可以)
- ❌ 调任何付费 API (FAL / ElevenLabs / Gemini / OpenAI image / Whisper)
- ❌ 改 server-v7 任何代码 (今晚只动前端 tv-html)
- ❌ 改 `.env*` / `package.json` / `prisma/` / 装新依赖
- ❌ 改 HANDOFF §4 列出的 12 个不动文件 (focus 系统 / keyRouter / main.ts boot / ActivationScreen 等)
- ❌ 删除任何 `if (isDevBrowser)` / `if (isDemoMode())` 分支
- ❌ 改 CSS / 动画 / 视觉 / 字体 / 图标 / 布局
- ❌ 修复"看到了但不在范围内"的 bug
- ❌ 在没有完成 §3 健康检查的情况下派 droid
- ❌ Kristy 睡眠中做范围之外的"额外好心改动"
- ❌ 钉钉派单 / 钉钉问答 (钉钉只能单向通知)

### 2.2 绝对必须

- ✅ 派 droid 前完整阅读 `tv-html/HANDOFF_2026-04-28_server_integration.md`
- ✅ 每个 droid 任务结束后, 自检 `git diff` 没沾红线文件
- ✅ commit 用单文件 `git add <path>`, 不用 `-A` 不用 `.`
- ✅ commit message 前缀 `feat(tv-html-phase1):` 或 `feat(tv-html-phase2):` 便于 Kristy 早上识别
- ✅ 每个阶段结束后, 在 `coordination/done/` 写完整报告 + commit + push
- ✅ 钉钉单向推送 (开场 + 阶段 1 完成 + 阶段 2 完成 + 异常打断)
- ✅ 异常情况优先写 blocker md, 钉钉只是"让 Kristy 知道有 blocker", 详情看 git

---

## §3 派 droid 前必做的健康检查 (5 分钟)

VPS Claude 自己跑, 不用派 droid:

```bash
# 1. server 在线
pm2 list | grep wonderbear-server  # 必须 online
curl -s http://localhost:3000/api/health 2>&1 | head -3

# 2. 测试身份还有效
cat /tmp/e2e-test-context.json | jq .deviceTokenExpiresAt  # 必须 > 2026-04-28
curl -i -H "Authorization: Bearer $(cat /tmp/e2e-test-context.json | jq -r .deviceToken)" \
  http://localhost:3000/api/story/cmoh77cev00011kpxyv8nabei 2>&1 | head -5  # 必须 200

# 3. 磁盘 + 内存
df -h | grep -E "Filesystem|/$"  # / 必须 < 80%
free -h  # 内存必须 > 1G 可用

# 4. 当前 git 状态 (在 monorepo root)
cd /opt/wonderbear  # 假设 monorepo 在这里
git status
git log --oneline -1  # HEAD 必须 9eec031 或之后

# 5. 找 Kristy 之前传的录音文件 (PHASE2 用)
find /opt/wonderbear -name "*.mp3" -size +10k 2>/dev/null | head -5
find /tmp -name "*.mp3" -size +10k 2>/dev/null | head -5
ls /opt/wonderbear/poc-audio/ 2>/dev/null
```

**所有检查通过, 才能启动 PHASE1 droid。**

任意一项失败:
- pm2 未 online → 自己 `pm2 restart wonderbear-server`, 仍失败 → 写 blocker + 钉钉 + 停止
- token 过期 → 写 blocker + 钉钉 + 停止 (Kristy 必须重新签发)
- 磁盘 > 90% / 内存 < 200M → 写 blocker + 钉钉 + 停止
- git 状态不 clean → 自己 `git stash`, 记录 stash hash 在最终报告里
- HEAD 不是 9eec031 或之后 → 写 blocker + 钉钉 + 停止
- 录音文件找不到 → **不打断**, 标记 PHASE2 录音验证 fallback 到代码层即可

---

## §4 必须打断 (写 blocker md + 钉钉 + 停止) 的触发条件

只在这些情况下停止整个夜班 + 写 blocker, 其它情况自己消化:

1. **健康检查失败** (token 过期 / 磁盘满 / pm2 起不来 / git 状态异常)
2. **PHASE1 droid 失败 2 次** (一次 retry 后仍失败, 不要无限 retry)
3. **触碰红线** (droid 试图改 §2.1 红线文件, 立即停止该 droid + 写 blocker)
4. **范围外发现严重 bug** (例如 server 接口 500, 但**不要自己修 server**, 写 blocker)
5. **PHASE2 录音文件找不到 + 代码层验证也失败**
6. **预算告警** (本不应触发, 但万一 droid 误调付费 API, 立即停止)

不打断的情况 (自己消化, 报告里记录即可):
- droid 一次性失败 (允许 1 次 retry)
- 单个 API 字段映射小坑 (droid 自己解决)
- dev 链路 1-2 步偶发卡顿 (重新跑一遍, 仍卡才打断)
- "我觉得这样改更好" (拒绝, 严守范围)

---

## §5 报告 + 通知节奏

### 5.1 git 文件 (主通道)

| 时间点 | 写入路径 | git push |
|---|---|---|
| 开场 | `coordination/done/2026-04-28-night-shift-start.md` | ✅ |
| PHASE1 完成 | `coordination/done/2026-04-28-PHASE1-report.md` | ✅ |
| PHASE2 完成 | `coordination/done/2026-04-28-PHASE2-report.md` | ✅ |
| 任意阶段失败 | `coordination/blockers/2026-04-28-<reason>.md` | ✅ |
| 最终结束 | `coordination/done/2026-04-28-night-shift-summary.md` | ✅ |

### 5.2 钉钉单向通知 (辅助, 不可派单)

| 时间点 | 内容 |
|---|---|
| 开场 (健康检查通过) | "夜班启动, PHASE1 派单中, 预计 X 小时, 详情见 done/2026-04-28-night-shift-start.md" |
| PHASE1 完成 | "PHASE1 完成, 详情见 done/2026-04-28-PHASE1-report.md, 启动 PHASE2" |
| PHASE2 完成 | "PHASE2 完成, 详情见 done/2026-04-28-PHASE2-report.md, 夜班结束" |
| 异常 | "❗ blocker: <一句话原因>, 详情见 blockers/2026-04-28-<reason>.md" |

钉钉消息**不可超过 100 字**, 详细信息全部写到 git md 里, 让 Kristy 醒后 git pull 看。

---

## §6 自动停机条款

- 阶段 1 + 阶段 2 全部完成 → orchestrator 进入 idle, **不再做任何事**
- 任何阶段失败 → **立即停止**, 不重试 PHASE 级别 (droid 级别允许 retry 1 次)
- 明早 Kristy 给信号才启动 PHASE3 / 修复任务
- VPS Claude **不要自作主张**继续干活, 哪怕"还有时间"

---

## §7 明早 Kristy 醒来要看到的产物

1. **TV-HTML 在 `localhost:5176/` 不带 `?dev=1` 直接访问** (production 路径)
   - Home 6 菜单 ✅
   - Library 看到真 19 本书 ✅
   - 点任意一本 → cover → body 12 页真图 + 真 TTS ✅
   - 切学习模式 → 真英文 TTS ✅
   - 进 Learning 屏 → 真双语字符 ✅
   - Favorites → 真收藏列表 + 删除/取消收藏可点 ✅
   - Create → 3 slot 真历史缩略图 ✅
   - Bear Stars Editor 精选 → 点了能跳真书播放 ✅
   - Bear Stars 排行榜 / My Den / Settings → mock 不空白即可 ✅
2. **Dialogue + Generating 屏代码接通** (Kristy 早上真录音才触发)
3. **`coordination/done/` 下 3-4 份完整报告**
4. **`coordination/blockers/` 下 0 份 blocker** (理想), 如有则 Kristy 第一眼看
5. **fix/tv-gallery-v2 分支远程已 push** PHASE1+PHASE2 commit
6. **钉钉历史**: 最多 4 条单向通知

---

## §8 派 droid 建议

PHASE1 工作量评估: 6-8 文件改动, 推荐 1 个 droid 串行做完, 不并行。
PHASE2 工作量评估: 3-5 文件改动, 推荐 1 个 droid 串行做完, 不并行。

**不推荐并行 PHASE1 + PHASE2**, 因为两阶段可能改同一个 api.ts, 并行容易冲突。

每个 droid 启动前, 把对应 PHASE 的 md 文件路径作为 droid 的 task spec, droid 自己读 md 自己干, 完成后写报告。

---

**By: Local Claude (代 Kristy 派单)**
**Kristy 备注**: "明早醒来不要让我看到一堆空白屏, 主线全真数据, 附属屏界面对就行"
**通信约束**: git 派单 + git 报告 + 钉钉单向状态通知, **VPS Claude 自主决策不等回复**
