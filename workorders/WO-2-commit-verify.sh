#!/usr/bin/env bash
# WO-2-commit-verify.sh
# 验证 WO-2-commit 工单的 pre/post 状态
# 用法:
#   bash WO-2-commit-verify.sh pre    # commit 前跑
#   bash WO-2-commit-verify.sh post   # commit 后跑
#
# 退出码:
#   0 = 全过,可进入下一阶段
#   1 = 至少一项失败,禁止继续
#   2 = 用法错误

# 不开 set -e (避免单项失败时直接退出,我们要全部跑完汇总)
# 不开 set -u (有些 grep 会输出空字符串,需要后续兜底)

REPO=/opt/wonderbear
EXPECTED_PARENT_HASH=7bc9e88
EXPECTED_BRANCH=release/showroom-20260429
FAIL_COUNT=0
PASS_COUNT=0

# ---------- 工具函数 ----------
ok()   { printf "  \033[32m✅ PASS\033[0m  %s\n" "$1"; PASS_COUNT=$((PASS_COUNT+1)); }
fail() { printf "  \033[31m❌ FAIL\033[0m  %s\n" "$1"; FAIL_COUNT=$((FAIL_COUNT+1)); }
note() { printf "  \033[90m── %s\033[0m\n" "$1"; }
hr()   { printf "\n\033[1m─── %s ───\033[0m\n" "$1"; }

# safe_grep_count: 解决 grep -c 返回码 1 的陷阱
safe_grep_count() {
    local pattern="$1"
    local file="$2"
    if [ ! -f "$file" ]; then
        echo "FILE_MISSING"
        return
    fi
    local count
    count=$(grep -c "$pattern" "$file" 2>/dev/null)
    echo "${count:-0}"
}

# ---------- 入口校验 ----------
MODE="${1:-}"
if [ "$MODE" != "pre" ] && [ "$MODE" != "post" ]; then
    echo "用法: bash $0 pre|post"
    echo "  pre  = git commit 前跑"
    echo "  post = git commit 后跑"
    exit 2
fi

cd "$REPO" || { echo "❌ 无法进入 $REPO"; exit 1; }

printf "\033[1m=== WO-2-commit verify (%s mode) ===\033[0m\n" "$MODE"
echo "VPS git root: $REPO"
echo "Expected parent hash: $EXPECTED_PARENT_HASH"
echo "Expected branch: $EXPECTED_BRANCH"

# ============================================================
# PRE 模式:commit 前必须满足的条件
# ============================================================
if [ "$MODE" = "pre" ]; then

    hr "[1/4] 当前分支正确"
    note "为什么: 误切走分支会让 commit 落到错的地方,污染 history"
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
    if [ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ]; then
        ok "branch=$CURRENT_BRANCH"
    else
        fail "branch=$CURRENT_BRANCH (期望 $EXPECTED_BRANCH)"
    fi

    hr "[2/4] HEAD 是 WO-1 commit (parent 锚点)"
    note "为什么: WO-2-commit 必须直接基于 WO-1 commit,中间不能有其他 commit 漂"
    HEAD_HASH=$(git rev-parse --short HEAD 2>/dev/null)
    if [ "$HEAD_HASH" = "$EXPECTED_PARENT_HASH" ]; then
        ok "HEAD=$HEAD_HASH"
    else
        fail "HEAD=$HEAD_HASH (期望 $EXPECTED_PARENT_HASH)"
        note "如果 HEAD 已经移动,可能 WO-2-commit 已经做过了,跑 post 模式验证"
    fi

    hr "[3/4] 3 个目标文件确实是 modified 状态"
    note "为什么: 必须有真实改动可 commit,空 commit 没意义"
    declare -a TARGET_FILES=(
        "server-v7/src/config/env.js"
        "server-v7/src/routes/story.js"
        "server-v7/src/services/asr.js"
    )
    for f in "${TARGET_FILES[@]}"; do
        STATUS=$(git status -s "$f" 2>/dev/null | awk '{print $1}')
        if [ "$STATUS" = "M" ]; then
            ok "$f modified"
        else
            fail "$f status='$STATUS' (期望 'M')"
        fi
    done

    hr "[4/4] .git/info/exclude 包含 backups-archive/"
    note "为什么: commit 前必须先加 ignore,否则 git add 时可能误带进 backups-archive/"
    EXCLUDE_FILE=".git/info/exclude"
    BACKUPS_ARCHIVE_COUNT=$(safe_grep_count '^backups-archive/' "$EXCLUDE_FILE")
    if [ "$BACKUPS_ARCHIVE_COUNT" = "FILE_MISSING" ]; then
        fail "$EXCLUDE_FILE 文件不存在"
    elif [ "$BACKUPS_ARCHIVE_COUNT" -ge 1 ]; then
        ok "已包含 backups-archive/ ignore 规则"
    else
        fail "未包含 backups-archive/ — 执行步骤 3 加 ignore 后再跑 pre"
    fi

    # ── 附加段:列出当前 untracked 状态(参考用,不影响通过) ──
    hr "[附加] 当前 untracked 文件列表(预期)"
    note "下面这些 untracked 不应在本 commit 范围内 — pre 验证不会拦,只是提醒"
    git status -s | grep '^??' | head -10 || true
    UNTRACKED_LINES=$(git status -s 2>/dev/null | grep '^??' || true)
    if [ -z "$UNTRACKED_LINES" ]; then UNTRACKED_TOTAL=0; else UNTRACKED_TOTAL=$(echo "$UNTRACKED_LINES" | wc -l); fi
    note "untracked 总数: $UNTRACKED_TOTAL (预期: coordination 15 + workorders 1 + backups-archive 0[已ignore])"

# ============================================================
# POST 模式:commit 后必须满足的条件
# ============================================================
elif [ "$MODE" = "post" ]; then

    hr "[1/5] HEAD 已不是 WO-1 commit (commit 已发生)"
    note "为什么: 如果 HEAD 仍是 7bc9e88,说明 commit 没生效,WO-2-commit 没完成"
    HEAD_HASH=$(git rev-parse --short HEAD 2>/dev/null)
    if [ "$HEAD_HASH" != "$EXPECTED_PARENT_HASH" ]; then
        ok "HEAD=$HEAD_HASH (新 commit)"
    else
        fail "HEAD=$HEAD_HASH 仍是 WO-1 (commit 没发生)"
    fi

    hr "[2/5] HEAD 的 parent 是 WO-1 commit (commit 顺序正确)"
    note "为什么: 验证 commit 直接基于 7bc9e88,中间没有偷塞其他 commit"
    PARENT_HASH=$(git rev-parse --short HEAD~1 2>/dev/null)
    if [ "$PARENT_HASH" = "$EXPECTED_PARENT_HASH" ]; then
        ok "HEAD~1=$PARENT_HASH"
    else
        fail "HEAD~1=$PARENT_HASH (期望 $EXPECTED_PARENT_HASH)"
    fi

    hr "[3/5] HEAD commit 改了精确 3 个文件"
    note "为什么: 不多不少,恰好 3 个 — 多了说明误带,少了说明漏 add"
    CHANGED_COUNT=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | wc -l)
    CHANGED_COUNT=${CHANGED_COUNT:-0}
    if [ "$CHANGED_COUNT" = "3" ]; then
        ok "改动文件数 = 3"
    else
        fail "改动文件数 = $CHANGED_COUNT (期望 3)"
        note "实际改动文件:"
        git diff --name-only HEAD~1 HEAD | sed 's/^/      /'
    fi

    hr "[4/5] HEAD commit 改的文件路径精确匹配"
    note "为什么: 即使数量对,也要确认是 env.js/story.js/asr.js 三个,不是别的"
    declare -a EXPECTED_PATHS=(
        "server-v7/src/config/env.js"
        "server-v7/src/routes/story.js"
        "server-v7/src/services/asr.js"
    )
    ACTUAL_PATHS=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | sort)
    EXPECTED_SORTED=$(printf '%s\n' "${EXPECTED_PATHS[@]}" | sort)
    if [ "$ACTUAL_PATHS" = "$EXPECTED_SORTED" ]; then
        ok "3 个文件路径完全匹配"
    else
        fail "文件路径不匹配"
        note "期望:"
        echo "$EXPECTED_SORTED" | sed 's/^/      /'
        note "实际:"
        echo "$ACTUAL_PATHS" | sed 's/^/      /'
    fi

    hr "[5/5] working tree 干净(只剩预期 untracked)"
    note "为什么: 不能有遗漏的 staged / modified — 否则下次 WO §0 又要处理这些"
    # 用 grep + wc -l 替代 grep -c,避免 grep -c 返回码 1 的陷阱
    # 即使没匹配,grep 返回 1 触发 || true 兜底,wc -l 数到 0
    STAGED_LINES=$(git status -s 2>/dev/null | grep -E '^[MARC]' || true)
    if [ -z "$STAGED_LINES" ]; then STAGED_COUNT=0; else STAGED_COUNT=$(echo "$STAGED_LINES" | wc -l); fi
    MODIFIED_LINES=$(git status -s 2>/dev/null | grep -E '^.M' || true)
    if [ -z "$MODIFIED_LINES" ]; then MODIFIED_COUNT=0; else MODIFIED_COUNT=$(echo "$MODIFIED_LINES" | wc -l); fi
    if [ "$STAGED_COUNT" = "0" ] && [ "$MODIFIED_COUNT" = "0" ]; then
        ok "无 staged / modified"
    else
        fail "still有 staged=$STAGED_COUNT modified=$MODIFIED_COUNT"
        note "git status -s 输出:"
        git status -s | sed 's/^/      /'
    fi

    # ── 附加段:列出新 commit 信息(供人眼审查) ──
    hr "[附加] 新 commit 摘要(供审查)"
    git log -1 --stat HEAD 2>/dev/null | head -20

fi

# ============================================================
# 汇总
# ============================================================
hr "汇总"
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"

if [ "$FAIL_COUNT" = "0" ]; then
    printf "\n\033[32m✅ %s 模式全过\033[0m\n" "$MODE"
    exit 0
else
    printf "\n\033[31m❌ %s 模式有 %d 项失败\033[0m\n" "$MODE" "$FAIL_COUNT"
    exit 1
fi
