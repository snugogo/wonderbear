# WO-3.17 — Verify 治理 + Coordination Hygiene + 自动化协调器

**版本:** 1.0
**派单时间:** 2026-05-01
**承接 Agent:** Factory V4 Pro(已验证 4 单 < ¥1)
**预估时间:** 90-120 分钟
**预估行数:** ~700-900 行新增 + ~10 个 backup 删除 + ~50 个文件入库

---

## §scope

本工单是**治理工单**,不动业务代码。整合 5 个 Part:

| Part | 主题 | 文件数 | 行数 |
|---|---|---|---|
| A | verify 治理(治本)| 3 个 sh | 707 |
| B | coordination/ 入库 | 1 .gitignore + 1 cleanup.sh | ~100 |
| C | 自动化协调器(静默版)| 3 个 sh + 2 个 JS patch | ~580 |
| D | backup 文件清理 | 1 cleanup.sh + 3 .gitignore 更新 | ~100 |
| E | GROUND-TRUTH.md 更新 | 1 文件改动 | ~80 |

**总计:** ~1500 行(含已有 Part A 的 707 行 lib)

---

## §accept-test-url

**本工单是治理工单,无产品 UI 验收 URL。**

验收标准:WO-3.17-verify.sh 全 PASS,且本目录下有完成报告。

---

## §previous-wo-whitelist

无。本工单是独立治理工单。

---

## §spillover-allowed

本工单允许的改动文件 regex(verify-lib.sh check_no_spillover 用):

```
workorders/verify-(lib|template)\.sh
workorders/WO-3\.17-verify\.sh
coordination/(\.gitignore|auto-coordinator\.sh|false-fail-judge\.sh|dingtalk-router\.sh|GROUND-TRUTH\.md)
coordination/archive/2026-04-30-v2lite/.*
coordination/(workorders|done|markers|auto-coordinator-logs)/.*
coordination/2026-.*\.md
dingtalk-bot/src/(done-watcher|command-router)\.js
tv-html/\.gitignore
server-v7/\.gitignore
h5/\.gitignore
```

允许的批量入库:`coordination/done/*.md` 和 `coordination/2026-*.md` 共约 30 个文件。

---

## §execution

### Part A: verify 治理(优先级最高,先做)

1. 部署 `workorders/verify-lib.sh`(从 `/tmp/wo-3.17/part-a/verify-lib.sh` 拷贝)
2. 替换 `workorders/verify-template.sh`(用 v3 版本)
3. **不要**改动现有 WO-3.16 等历史 verify(向后兼容,只对 WO-3.18+ 生效)
4. 自检:`bash -n workorders/verify-lib.sh && bash -n workorders/verify-template.sh`

### Part B: coordination/ 入库

1. 拷贝 `/tmp/wo-3.17/part-b/coordination.gitignore` → `coordination/.gitignore`
2. 拷贝 `/tmp/wo-3.17/part-b/cleanup-coordination.sh` → `/tmp/wo-3.17-cleanup-coord.sh`
3. 执行 `bash /tmp/wo-3.17-cleanup-coord.sh`
4. 检查 `git status --short coordination/ | grep '^??' | wc -l` 应 ≤ 5(原 55)
5. **不要 git add,不要 git commit**(由 Kristy 手动)

### Part C: 自动化协调器

1. 拷贝 3 个 sh 到 `coordination/`:
   - `auto-coordinator.sh`
   - `false-fail-judge.sh`
   - `dingtalk-router.sh`
2. `chmod +x coordination/{auto-coordinator,false-fail-judge,dingtalk-router}.sh`
3. **修改 `dingtalk-bot/src/done-watcher.js`** — 加 hook 调用 `auto-coordinator post-droid`
   - 具体 patch 见 §C-patch(下方,V4 Pro 完成 §1-2 后再做)
4. **修改 `dingtalk-bot/src/command-router.js`** — 加 `WO-X confirmed` / `WO-X reject` 分支
   - 具体 patch 见 §C-patch
5. **重启 PM2**: `pm2 restart wonderbear-dingtalk` 后**等 30 秒**确认 bot 启动正常
   - 若启动失败:`pm2 logs wonderbear-dingtalk --lines 50` 看错误
   - 紧急回滚:`git checkout dingtalk-bot/src/done-watcher.js dingtalk-bot/src/command-router.js && pm2 restart wonderbear-dingtalk`

### Part D: backup 清理

1. 拷贝 `/tmp/wo-3.17/part-d/cleanup-backups.sh` → `/tmp/wo-3.17-cleanup-backups.sh`
2. 执行 `bash /tmp/wo-3.17-cleanup-backups.sh`
3. 验证 `find tv-html/src server-v7/src -name '*.backup*' -o -name '*.bak'` 输出空

### Part E: GROUND-TRUTH.md 更新

1. 读取 `/tmp/wo-3.17/part-e/ground-truth-updates.md`
2. **append**(不要重写)新章节到 `coordination/GROUND-TRUTH.md`
3. 更新文件头 "Last verified" 字段为 `WO-3.17 (2026-05-01)`

---

## §C-patch

完整 patch 见 `/tmp/wo-3.17-bot-patches.md`(由 Kristy 上传)。

**核心改动两个文件,3 个 str_replace:**

1. `dingtalk-bot/src/index.js` 的 `triggerAutoVerify()` 函数 — 把"verify 直接推钉钉"改成"转交 auto-coordinator"
2. `dingtalk-bot/src/command-router.js` 的 `handleHelp()` 和 `route()` — 加 `验收/打回/工单状态` 三个新命令

**改完必须步骤:**

```bash
# sanity check(必须 exit 0)
node -c /opt/wonderbear/dingtalk-bot/src/index.js
node -c /opt/wonderbear/dingtalk-bot/src/command-router.js

# 重启
pm2 restart wonderbear-dingtalk
sleep 3

# 观察启动是否正常(应看到 [BOOT] DingTalk bot v0.9.3 ...)
pm2 logs wonderbear-dingtalk --lines 20 --nostream
```

**回滚(出问题时):**

```bash
cd /opt/wonderbear
git checkout dingtalk-bot/src/index.js dingtalk-bot/src/command-router.js
pm2 restart wonderbear-dingtalk
```

详细 str_replace 段落、烟测脚本见 `/tmp/wo-3.17-bot-patches.md`。

---

## §verify

```bash
bash /opt/wonderbear/workorders/WO-3.17-verify.sh
```

期望:全 PASS。

---

## §OUT-OF-SCOPE

明确不在本工单做的事(避免 V4 Pro 越界):

1. ❌ 不改任何业务代码(tv-html/src/screens/*.vue 等)
2. ❌ 不动 spawn-droid.sh 主体(只读现有逻辑作为 hook 参考)
3. ❌ 不重写 orchestrator-loop.sh(systemd 仍 disabled)
4. ❌ 不 git add / git commit / git push(Kristy 手动)
5. ❌ 不动 .env(可读,不能写)
6. ❌ 不改任何 ASR / TTS / LLM provider 配置
7. ❌ 不修复 memory #21 5 个产品反馈(留给 WO-3.18+)
8. ❌ 不改历史 verify(WO-3.6 至 WO-3.16 等的 verify 维持原样,新 lib 仅对 WO-3.18+ 强制)

---

## §risk

### 🔴 Risk 1: dingtalk-bot 重启时派单链路中断(~2 秒)

**缓解:**
- V4 Pro 在 Part C step 5 重启 bot 前,**先确认当前无活动派单**(查 `pm2 logs --lines 5` 无进行中任务)
- 重启时间在 Kristy 钉钉发送窗口外(凌晨 / 深夜 优先)
- 若 Kristy 在工单执行期间发了消息,V4 Pro 在完成报告里标注「重启窗口可能丢消息 X」

### 🔴 Risk 2: Part B 入库时不小心 commit 敏感凭据

**缓解:** `cleanup-coordination.sh` 内置 `grep` 扫描 `api_key|secret|password|token|sk-*|AIza*` 关键词,发现立即中止。

### 🔴 Risk 3: false-fail-judge LLM 兜底调用失败导致协调器卡死

**缓解:** `curl -m 8` 8 秒超时,失败默认放行(不阻塞)。Kristy 痛点是误报多,默认放行符合偏好。

### 🔴 Risk 4: Part A lib 引入后,V4 Pro 在 WO-3.18 写新 verify 时仍不 source

**缓解:** WO-3.17-verify 不检查 WO-3.18(本工单结束时 WO-3.18 还不存在),
但 verify-template.sh v3 头部强制注释 + WO-3.17 完成报告里写明「WO-3.18 起 verify 必须 source」,
Kristy 派 WO-3.18 时把这条要求复制进工单 §verify 章节。

---

## §deliverables

V4 Pro 完成报告应放在:`coordination/done/WO-3.17-report.md`

报告必须包含:
1. **Part A 部署清单**:verify-lib.sh / verify-template.sh 字节数 + bash -n 通过
2. **Part B 入库清单**:迁移到 archive/ 的文件数 + 仍 untracked 的文件清单
3. **Part C 改动清单**:3 个 sh 部署 + 2 个 JS 文件 diff(line numbers)
4. **Part D 删除清单**:具体删了哪 10 个 backup 文件
5. **Part E 更新位置**:GROUND-TRUTH.md 新增章节行号
6. **Risk 出现**:Part C bot 重启是否丢消息、有无敏感凭据告警
7. **建议下一工单**:基于本次治理结果,WO-3.18 应该做哪些(memory #21 5 个产品反馈拆分建议)
