# WO-DT-1-commit: 钉钉机器人 ack 改造 commit 落地

**类型**：Mini 工单（不需要 Factory / 三件套 / 钉钉派单）
**改动量**：3 个 .js 文件 +44/-4 + 1 行 .gitignore
**操作时间**：5 分钟
**风险**：低（仅 git 操作，不动 prod 进程）

---

## 问题

今天派了 WO-DT-1.1（4 条慢命令加 ack）+ WO-DT-1.1.1（修 ack/done 矛盾），**改动还在 working tree**：

```
M dingtalk-bot/src/command-router.js   (+20/-3)
M dingtalk-bot/src/factory-dispatch.js  (+12/-0)
M dingtalk-bot/src/index.js             (+16/-1)
?? 4 个 *.backup-2026-04-30-wodt11-pre / wodt111-pre 文件
```

不 commit 的话，明天派 WO-3 改 server 时容易和这些改动混淆/丢失。
而且 .gitignore 没有 backup 排除规则——以后每个工单的 backup 都需要手动避开，**累积风险**。

---

## 改动

### 改动 1：加 .gitignore backup 排除规则（一劳永逸）

文件：`/opt/wonderbear/.gitignore`

操作：在文件末尾追加一行

```
# WO 工单备份锚点（不入库）
**/*.backup-*
```

### 改动 2：commit dingtalk-bot 的 3 个 .js 改动

仅 git add **真实代码改动**，**不 add** 任何 backup 文件：

```
git add dingtalk-bot/src/command-router.js
git add dingtalk-bot/src/factory-dispatch.js
git add dingtalk-bot/src/index.js
git add .gitignore
```

commit message：
```
feat(dingtalk-bot): WO-DT-1 ack 改造 — 4 条慢命令立即反馈 + done 前置检查

WO-DT-1.1 (4 条命令加 ack):
- 派 WO-X / /sync / /learn / /status-refresh 进入处理前发 "📥 已收到"
- handleDispatch + route 加 3 个参数透传（向后兼容）
- 自由对话已有 "🤖 处理中..." 不动

WO-DT-1.1.1 (修 ack/done 矛盾):
- factory-dispatch.js 抽出 checkAlreadyDone 公共函数
- handleDispatch 在 ack 前先检查 done 状态
- 已完成工单只回 ❌，不再发误导性 ack

附：.gitignore 加 backup 排除规则，以后所有 *.backup-* 自动忽略。
```

---

## 验证

### 验证 1：commit 后 working tree 应该清白

```bash
ssh wonderbear-vps "cd /opt/wonderbear && git status -s dingtalk-bot/"
```

**预期**：输出空（dingtalk-bot/ 下无 M 文件，backup 文件被 .gitignore 排除）

### 验证 2：commit 出现在 log 里

```bash
ssh wonderbear-vps "cd /opt/wonderbear && git log --oneline -2"
```

**预期**：第 1 行是 `feat(dingtalk-bot): WO-DT-1 ack 改造 ...`

### 验证 3：backup 文件还在硬盘上（未删，作为回滚锚点）

```bash
ssh wonderbear-vps "ls /opt/wonderbear/dingtalk-bot/src/*.backup-* | wc -l"
```

**预期**：4

### 验证 4：.gitignore 排除规则生效

```bash
ssh wonderbear-vps "cd /opt/wonderbear && git check-ignore -v dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt11-pre"
```

**预期**：输出包含 `.gitignore:N: **/*.backup-*` 这种格式（说明规则匹配）

---

## 回滚

如果 commit 后发现哪里不对：

```bash
ssh wonderbear-vps "cd /opt/wonderbear && git reset --soft HEAD~1"
```

这条**只撤销 commit 不撤销改动**——文件仍然是 modified 状态，你可以重新决定怎么 commit。

如果连 .gitignore 改动也想撤销：
```bash
git checkout HEAD -- .gitignore  # 注：这会撤销 .gitignore，谨慎用
```

---

## 经验（沉淀）

1. **backup 文件不能 commit** —— 它们是回滚锚点，本地保留即可
2. **.gitignore 里加 `**/*.backup-*` 是一劳永逸的防呆** —— 以后所有 WO 的 backup 都不会误 commit
3. **Mini 工单不需要三件套** —— 5 分钟操作但需要 git 存档，单 .md 就够

---

## 操作命令（你 ssh 一气呵成跑）

```bash
ssh wonderbear-vps "cd /opt/wonderbear && \
echo '' >> .gitignore && \
echo '# WO 工单备份锚点（不入库）' >> .gitignore && \
echo '**/*.backup-*' >> .gitignore && \
echo '=== 1. .gitignore 末尾确认 ===' && \
tail -5 .gitignore && \
echo '' && \
echo '=== 2. git status (commit 前) ===' && \
git status -s dingtalk-bot/ .gitignore && \
echo '' && \
echo '=== 3. git add 真实改动 ===' && \
git add dingtalk-bot/src/command-router.js dingtalk-bot/src/factory-dispatch.js dingtalk-bot/src/index.js .gitignore && \
git status -s && \
echo '' && \
echo '=== 4. commit ===' && \
git commit -m 'feat(dingtalk-bot): WO-DT-1 ack 改造 — 4 条慢命令立即反馈 + done 前置检查

WO-DT-1.1 (4 条命令加 ack):
- 派 WO-X / /sync / /learn / /status-refresh 进入处理前发 \"📥 已收到\"
- handleDispatch + route 加 3 个参数透传（向后兼容）
- 自由对话已有 \"🤖 处理中...\" 不动

WO-DT-1.1.1 (修 ack/done 矛盾):
- factory-dispatch.js 抽出 checkAlreadyDone 公共函数
- handleDispatch 在 ack 前先检查 done 状态
- 已完成工单只回 ❌，不再发误导性 ack

附：.gitignore 加 backup 排除规则，以后所有 *.backup-* 自动忽略。' && \
echo '' && \
echo '=== 5. 验证 working tree 清白 ===' && \
git status -s dingtalk-bot/ && \
echo '' && \
echo '=== 6. 最近 2 commit ===' && \
git log --oneline -2 && \
echo '' && \
echo '=== 7. .gitignore 排除规则生效检查 ===' && \
git check-ignore -v dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt11-pre"
```

跑完应该看到（按段）：
1. `.gitignore` 末尾 3 行新加的内容
2. commit 前看到 M 文件
3. add 后 status 显示 `M` 不是 `A` 或 `??`（已 stage）
4. commit 成功，输出 `[release/showroom-20260429 abc1234] feat(...)`
5. **空输出**（working tree 清白）✅
6. 第一行是新 commit
7. .gitignore 排除规则生效

---

End of WO-DT-1-commit (Mini)
