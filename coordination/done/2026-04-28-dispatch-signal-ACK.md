# 派单启动信号 - 2026-04-28 夜班

To: VPS Claude (orchestrator)
From: Kristy
Kristy 状态: 即将睡觉, 不可被打断, 自主决策严守范围

## 行动指令

1. 立即 git pull:
   cd /opt/wonderbear
   git pull origin fix/tv-gallery-v2

2. 读取任务包(已通过 git push 上传):
   coordination/workorders/2026-04-28-tv-html-phase1-phase2/
   - 2026-04-28-VPS-CLAUDE-orchestration-readme.md (先读总调度)
   - 2026-04-28-PHASE1-tv-html-server-read-integration.md
   - 2026-04-28-PHASE2-tv-html-server-write-integration.md

3. 执行: 按 README 的 §3 健康检查 -> PHASE1 -> PHASE2 流程

4. 通信约束:
   - 派单: git workorders (已 pull)
   - 报告: 写 md 到 coordination/done/ + commit + push
   - 异常打断: 写 md 到 coordination/blockers/ + commit + push
   - 状态通知: 钉钉单向, 不等回复
   - 不要等回复, 自主决策, 严守范围

5. 关键约束:
   - Branch: fix/tv-gallery-v2 (HEAD 7d4a8ee 是派单 commit, 工作 commit 在此之上)
   - 总预算: 0 USD (PHASE1+PHASE2 都不调付费 API)
   - 严格串行, 失败立即停止
   - 不动 main.ts boot / ActivationScreen / useFocusable / CSS
   - dev 路径 (?dev=1) 必须 100% 保持

6. 明早 Kristy 醒来要看到:
   - coordination/done/ 下 PHASE1+PHASE2 报告
   - coordination/blockers/ 理想为空
   - fix/tv-gallery-v2 已 push

## 自动停机
- PHASE1+PHASE2 全完成 -> idle
- 任何阶段失败 -> 立即停止
- 不要自作主张继续干活
