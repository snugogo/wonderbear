#!/usr/bin/env bash
# /opt/wonderbear/workorders/verify-lib.sh
#
# WonderBear 工单 verify 规则函数库 — v3
# 创建于 WO-3.17,治理 WO-3.6 至 WO-3.16.1 累积的 7 类假 FAIL
#
# === 使用方式(强制) ===
# 新工单的 verify.sh **第一行必须是**:
#   #!/usr/bin/env bash
#   source /opt/wonderbear/workorders/verify-lib.sh
#
# 然后调用本库提供的函数,而不是自己写 grep。例:
#   check_no_luna_regression
#   check_no_spillover "tv-html/src/screens/Foo.vue|server-v7/src/routes/bar.js"
#   check_no_backup_files
#   verify_summary
#
# === 不能 source 的工单算违规 ===
# WO-3.17-verify.sh 会扫描 workorders/WO-*-verify.sh 检查首行 source 语句,
# 缺失即 FAIL。这是 verify 治理的强制点。
#
# === 7 类假 FAIL 都被库收编了哪些 ===
#   规则 1 (.backup/.bak 文件)         → check_no_backup_files
#   规则 2 (类型同步 spillover)         → check_no_spillover 默认带 services/api.ts + stores/*.ts 白名单
#   规则 3 (cross-WO invariant scope)  → check_no_luna_regression 等具名 invariant
#   规则 4 (grep 命中注释行)            → grep_excluding_comments(底层工具)
#   规则 5 (数组多元素同行计数失真)      → grep_count_multiline_safe(底层工具)
#   规则 6 (前置工单白名单)             → check_no_spillover 接受第二参数
#   规则 7 (CSS 选择器扫 styles 目录)    → check_selector_exists 跨 .vue+.css 全扫
#
# 库版本:v3 (2026-05-01 WO-3.17)

set -u

# ============ 全局变量(工单 verify 也用) ============
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=0

REPO_ROOT="/opt/wonderbear"
TV_DIR="${REPO_ROOT}/tv-html"
SERVER_DIR="${REPO_ROOT}/server-v7"
H5_DIR="${REPO_ROOT}/h5"
WORKORDERS_DIR="${REPO_ROOT}/workorders"

# ============ 报告辅助函数 ============
check_pass() { PASS=$((PASS + 1)); echo -e "${GREEN}✅ PASS${NC}"; }
check_fail() { FAIL=$((FAIL + 1)); echo -e "${RED}❌ FAIL${NC} — $1"; }
check_skip() { echo -e "${YELLOW}⏭ SKIP${NC} — $1"; }

# ============ 底层 grep 工具(规则 4/5 收编) ============

# grep_excluding_comments — 排除 //, /*, *, <!-- 开头的注释行
# 规则 4 收编:WO-3.16 假 FAIL — 命中注释行被当作 production 引用
#
# 用法: grep_excluding_comments <pattern> <file_or_dir> [extra_grep_args...]
grep_excluding_comments() {
  local pattern="$1"
  local target="$2"
  shift 2
  grep -rE "$pattern" "$target" "$@" 2>/dev/null \
    | grep -vE '^\s*//' \
    | grep -vE '^\s*\*' \
    | grep -vE '^\s*/\*' \
    | grep -vE '^\s*<!--' \
    || true
}

# grep_count_multiline_safe — 计数前先把数组多元素同行拆开
# 规则 5 收编:WO-3.16 假 FAIL — i18n 数组同行 grep 计数失真
#
# 用法: grep_count_multiline_safe <pattern> <file>
# 返回:stdout 是数字
grep_count_multiline_safe() {
  local pattern="$1"
  local file="$2"
  if [ ! -f "$file" ]; then echo "0"; return; fi
  # 先把 , 替换成换行,再 grep -c
  tr ',' '\n' < "$file" 2>/dev/null \
    | grep -cE "$pattern" 2>/dev/null \
    | tr -d ' ' \
    || echo "0"
}

# ============ 规则 1: backup 文件残留检查 ============

# check_no_backup_files — 强制无 *.backup-* / *.bak 残留
# 规则 1 收编:WO-3.15 教训。每个工单做完必须无 backup 残留。
#
# 用法: check_no_backup_files
check_no_backup_files() {
  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] 无 .backup-* / .bak 文件残留"
  local found
  found=$(find "${TV_DIR}/src" "${SERVER_DIR}/src" "${H5_DIR}/src" 2>/dev/null \
    \( -name '*.backup*' -o -name '*.bak' \) 2>/dev/null)
  if [ -z "$found" ]; then
    check_pass
  else
    check_fail "发现 backup 文件,V4 Pro 应 git stash 而非创建 .backup:"
    echo "$found" | sed 's/^/    /'
  fi
  echo ""
}

# ============ 规则 2/6: spillover 检查(白名单 + 前置工单) ============

# check_no_spillover — git status 检查 spillover,带白名单
# 规则 2 收编:WO-3.12 — services/api.ts / stores/*.ts 类型同步合法
# 规则 6 收编:WO-3.16.1 — 前置工单已改文件应豁免
#
# 用法:
#   check_no_spillover "<expected-files-regex>"
#   check_no_spillover "<expected-files-regex>" "<previous-wo-files-regex>"
# 例:
#   check_no_spillover "tv-html/src/screens/Foo\.vue|server-v7/src/routes/bar\.js"
#   check_no_spillover "<本工单 regex>" "tv-html/src/screens/DialogueScreen\.vue"  # WO-3.16.1 合法继续改 DialogueScreen
check_no_spillover() {
  local expected_regex="$1"
  local prev_wo_regex="${2:-}"

  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] 无 spillover 到无关文件"

  # 默认白名单:类型同步 + 工单/coordination
  local default_whitelist='^(tv-html/src/services/api\.ts|tv-html/src/stores/.*\.ts|coordination/|workorders/)'

  # 组装允许的 regex
  local full_allow="${default_whitelist}"
  if [ -n "$expected_regex" ]; then
    full_allow="${full_allow}|^(${expected_regex})$"
  fi
  if [ -n "$prev_wo_regex" ]; then
    full_allow="${full_allow}|^(${prev_wo_regex})$"
  fi

  cd "${REPO_ROOT}" || { check_fail "cannot cd to ${REPO_ROOT}"; return; }

  local spillover
  spillover=$(git status -s 2>/dev/null \
    | grep -E '^[ MARC?][MARC?]?\s' \
    | awk '{print $NF}' \
    | grep -vE "${full_allow}" \
    || true)

  if [ -z "$spillover" ]; then
    check_pass
  else
    check_fail "spillover (未在 expected/whitelist/prev-wo 列表):"
    echo "$spillover" | sed 's/^/    /'
  fi
  echo ""
}

# ============ 规则 3: cross-WO invariant(具名常量检查)============

# check_no_luna_regression — Luna 不能重新出现在 production 代码
# 规则 3 收编:跨 WO invariant,需显式调用才检查
#
# 用法: check_no_luna_regression
# 排除:demo/mock/test/fixture/backup
check_no_luna_regression() {
  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] WO-3.9 invariant: Luna 不重现 production 代码"

  local luna_count
  luna_count=$(grep -rn 'Luna' "${TV_DIR}/src" \
    --include='*.ts' --include='*.vue' --include='*.json' 2>/dev/null \
    | grep -v '/dev/' \
    | grep -v '\.backup' \
    | grep -v '/utils/demoStory' \
    | grep -v '/utils/.*demo' \
    | grep -v 'test\.' \
    | grep -v '__tests__' \
    | grep -v 'mock' \
    | grep -v 'fixture' \
    | wc -l | tr -d ' ')
  [ -z "$luna_count" ] && luna_count=0

  echo "  Luna refs (filtered): ${luna_count}"
  if [ "$luna_count" = "0" ]; then
    check_pass
  else
    check_fail "Luna 在 production 代码中重现"
  fi
  echo ""
}

# ============ 规则 7: CSS 选择器全栈扫描 ============

# check_selector_exists — 检查 CSS 选择器在 .vue / .css / .ts 全部命中
# 规则 7 收编:WO-3.16.1 假 FAIL — 选择器在 styles/global.css 不在 .vue
#
# 用法: check_selector_exists ".tv-stage" "组件 Foo 应有 .tv-stage 样式"
check_selector_exists() {
  local selector="$1"
  local description="$2"

  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] CSS 选择器存在: ${selector} (${description})"

  # 跨 vue/css/ts/scss 全扫
  local hits
  hits=$(grep -rE "${selector}" "${TV_DIR}/src" \
    --include='*.vue' --include='*.css' --include='*.scss' --include='*.ts' \
    2>/dev/null | wc -l | tr -d ' ')
  [ -z "$hits" ] && hits=0

  echo "  hits across .vue/.css/.scss/.ts: ${hits}"
  if [ "$hits" -ge 1 ] 2>/dev/null; then
    check_pass
  else
    check_fail "选择器 ${selector} 在 src/ 全栈扫描中找不到"
  fi
  echo ""
}

# ============ 通用辅助:文件存在性 / 内容匹配 ============

# check_files_exist <file1> <file2> ...
check_files_exist() {
  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] 目标文件全部存在"
  local missing=""
  for f in "$@"; do
    if [ ! -f "$f" ]; then
      missing="${missing}\n    ${f}"
    fi
  done
  if [ -z "$missing" ]; then
    check_pass
  else
    check_fail "missing files:"
    echo -e "$missing"
  fi
  echo ""
}

# check_pattern_in_file <pattern> <file> <description>
# 用规则 4(排除注释)+ 规则 5(多元素拆行)安全计数
check_pattern_in_file() {
  local pattern="$1"
  local file="$2"
  local description="$3"

  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] ${description}"

  if [ ! -f "$file" ]; then
    check_fail "file not found: ${file}"
    echo ""
    return
  fi

  # 先按规则 5 多元素拆行 + 规则 4 排注释
  local hits
  hits=$(tr ',' '\n' < "$file" 2>/dev/null \
    | grep -E "$pattern" \
    | grep -vE '^\s*(//|\*|/\*|<!--)' \
    | wc -l | tr -d ' ')
  [ -z "$hits" ] && hits=0

  echo "  hits (excluding comments, multiline-safe): ${hits}"
  if [ "$hits" -ge 1 ] 2>/dev/null; then
    check_pass
  else
    check_fail "pattern not found in ${file}"
  fi
  echo ""
}

# check_pattern_absent_in_file <pattern> <file> <description>
# 反向断言:某 pattern 不应出现(用于品牌词清理等)
check_pattern_absent_in_file() {
  local pattern="$1"
  local file="$2"
  local description="$3"

  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] ${description}"

  if [ ! -f "$file" ]; then
    check_fail "file not found: ${file}"
    echo ""
    return
  fi

  local hits
  hits=$(tr ',' '\n' < "$file" 2>/dev/null \
    | grep -E "$pattern" \
    | grep -vE '^\s*(//|\*|/\*|<!--)' \
    | wc -l | tr -d ' ')
  [ -z "$hits" ] && hits=0

  echo "  unwanted hits: ${hits}"
  if [ "$hits" = "0" ]; then
    check_pass
  else
    check_fail "pattern still present in ${file}:"
    grep -nE "$pattern" "$file" | grep -vE '^\s*[0-9]+:\s*(//|\*|/\*|<!--)' | head -5 | sed 's/^/    /'
  fi
  echo ""
}

# check_npm_build <dir> <description>
check_npm_build() {
  local dir="$1"
  local description="${2:-npm run build passes}"

  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] ${description}"

  cd "$dir" || { check_fail "cannot cd ${dir}"; echo ""; return; }
  local build_out build_rc
  build_out=$(npm run build 2>&1)
  build_rc=$?

  if [ $build_rc -eq 0 ]; then
    if echo "$build_out" | grep -qE '\b(error|ERROR)\b' 2>/dev/null; then
      check_fail "build returned 0 但 output 含 error"
      echo "$build_out" | tail -20 | sed 's/^/    /'
    else
      check_pass
    fi
  else
    check_fail "build exited ${build_rc}"
    echo "$build_out" | tail -30 | sed 's/^/    /'
  fi
  echo ""
}

# check_node_require <file> <description>
check_node_require() {
  local file="$1"
  local description="${2:-node require ${file}}"

  TOTAL=$((TOTAL + 1))
  echo "[${TOTAL}] ${description}"

  cd "${SERVER_DIR}" || { check_fail "cannot cd ${SERVER_DIR}"; echo ""; return; }
  local out rc
  out=$(node -e "require('${file}')" 2>&1)
  rc=$?

  if [ $rc -eq 0 ]; then
    check_pass
  else
    check_fail "node require failed:"
    echo "$out" | sed 's/^/    /'
  fi
  echo ""
}

# ============ 终结函数 ============

# verify_summary — 工单 verify 必须最后调用
# 输出汇总,基于 PASS/FAIL/TOTAL 决定 exit code
verify_summary() {
  echo "============================================================"
  echo "Summary: ${PASS}/${TOTAL} PASS, ${FAIL} FAIL"
  echo "============================================================"
  echo ""
  if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}✅ All ${TOTAL} checks PASS${NC}"
    exit 0
  else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} FAIL${NC}"
    exit 1
  fi
}

# ============ 库自检 ============
# 如果直接执行本文件而不是 source,提示用法
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  cat <<EOF
本文件是 verify 函数库,不应直接执行。

用法:
  在工单的 verify.sh 第一行写:

    #!/usr/bin/env bash
    source /opt/wonderbear/workorders/verify-lib.sh

  然后调用函数:

    check_files_exist "${TV_DIR}/src/screens/Foo.vue"
    check_pattern_in_file 'pattern' "$file" "描述"
    check_no_backup_files
    check_no_spillover "tv-html/src/screens/Foo\.vue|server-v7/src/routes/bar\.js"
    check_no_luna_regression
    verify_summary

API 索引(规则收编):
  - check_no_backup_files                       (规则 1)
  - check_no_spillover <expected> [<prev-wo>]   (规则 2 + 6)
  - check_no_luna_regression                    (规则 3)
  - check_selector_exists <selector> <desc>     (规则 7)
  - grep_excluding_comments (底层)              (规则 4)
  - grep_count_multiline_safe (底层)            (规则 5)
  - check_pattern_in_file (用 4+5)
  - check_pattern_absent_in_file (用 4+5)
  - check_files_exist
  - check_npm_build
  - check_node_require
  - verify_summary
EOF
  exit 1
fi
