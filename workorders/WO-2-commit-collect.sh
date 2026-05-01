#!/usr/bin/env bash
# WO-2-commit-collect.sh
# 因为 WO-2-commit 由 Kristy 自己执行(非 Factory),没有 droid-runs / done/ 报告
# 改成 4 段:commit 状态 / commit 内容 / git log / 路径状态
# 用法: bash WO-2-commit-collect.sh

REPO=/opt/wonderbear

cd "$REPO" || { echo "❌ 无法进入 $REPO"; exit 1; }

printf "\033[1m=== WO-2-commit collect ===\033[0m\n"
echo "VPS git root: $REPO"
echo

# ── [1/4] HEAD commit 摘要 ──
printf "\033[1m── [1/4] HEAD commit 摘要 ──\033[0m\n"
git log -1 --pretty=format:"hash: %H%nshort: %h%ndate: %ai%nauthor: %an <%ae>%n" HEAD 2>/dev/null
echo
echo

# ── [2/4] HEAD commit 完整 message + diff stat ──
printf "\033[1m── [2/4] HEAD commit message + diff stat ──\033[0m\n"
git log -1 --stat HEAD 2>/dev/null
echo

# ── [3/4] 最近 5 个 commit(对照 WO-1 / pre-WO1 历史) ──
printf "\033[1m── [3/4] 最近 5 个 commit ──\033[0m\n"
git log -5 --oneline 2>/dev/null
echo

# ── [4/4] 当前 working tree 状态(确认还是干净) ──
printf "\033[1m── [4/4] 当前 working tree 状态(git status -s) ──\033[0m\n"
git status -s 2>/dev/null
echo

# ── 附加:.git/info/exclude 现状 ──
printf "\033[1m── [附加] .git/info/exclude 现状 ──\033[0m\n"
echo "ignore 规则总数:"
grep -cv '^#\|^$' /opt/wonderbear/.git/info/exclude 2>/dev/null || echo 0
echo
echo "完整内容:"
cat /opt/wonderbear/.git/info/exclude 2>/dev/null
echo

# ── 附加:回滚指南 ──
printf "\033[1m── [附加] 回滚指南 ──\033[0m\n"
cat <<EOF
软回滚(改 message / 改范围):
  git reset --soft 7bc9e88
  # 然后重新 git add + commit

硬回滚(完全推倒重来,慎用 — 会撤销 prod 实际改动):
  git reset --hard 7bc9e88
  pm2 restart wonderbear-server

amend(只改最新 commit 的 message):
  git commit --amend -m "新 message"
EOF
