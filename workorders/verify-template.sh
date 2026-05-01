#!/usr/bin/env bash
# /opt/wonderbear/workorders/verify-template.sh — v3 (post WO-3.17)
#
# === 用法 ===
# 1. 复制这份文件: cp verify-template.sh WO-X.X-verify.sh
# 2. 替换下面 <WO-ID> / <one-line title> / 各 check_* 调用为本工单的实际检查
# 3. 不要写裸 grep 或 git status 检查 — 用 verify-lib.sh 的函数
# 4. 工单 README 的 §verify 必须写「base on workorders/verify-template.sh and source verify-lib.sh」
#
# === 强制规则 ===
# WO-3.17 起,workorders/WO-*-verify.sh 的第一行(shebang 之后第一句非空非注释)
# 必须是: source /opt/wonderbear/workorders/verify-lib.sh
# 否则 WO-3.17-verify.sh 在治理检查中会判定 FAIL。

source /opt/wonderbear/workorders/verify-lib.sh

# ===== 工单基本信息 =====
echo "============================================================"
echo "WO-X.X verify — <one-line title>"
echo "============================================================"
echo ""

# ===== 工单文件目标(供 spillover 检查用)=====
# 用 regex 写,例:
#   EXPECTED_FILES='tv-html/src/screens/(Foo|Bar)\.vue|server-v7/src/routes/baz\.js'
EXPECTED_FILES='<workorder-files-regex>'

# 前置工单已改文件白名单(规则 6,WO-3.16.1 教训):
# 后续补丁(WO-3.17.1 等)如果要继续改前置工单已改的文件,在这里列出。
# 留空字符串表示无前置依赖。
PREVIOUS_WO_FILES=''

# ===== 检查列表(按需启用)=====
# 文件存在性
# check_files_exist \
#   "${TV_DIR}/src/screens/Foo.vue" \
#   "${SERVER_DIR}/src/routes/bar.js"

# 内容检查(自动排除注释、自动多行安全)
# check_pattern_in_file 'someFunctionName' \
#   "${TV_DIR}/src/screens/Foo.vue" \
#   "Foo 调用 someFunctionName"

# 反向断言(品牌词清理类)
# check_pattern_absent_in_file '\bLuna\b' \
#   "${TV_DIR}/src/screens/HomeScreen.vue" \
#   "HomeScreen 不再硬编码 Luna"

# CSS 选择器全栈扫描
# check_selector_exists '\.tv-stage' "TV 全屏舞台样式存在"

# 构建测试
# check_npm_build "${TV_DIR}" "tv-html npm run build 通过"

# Node require 烟测
# check_node_require './src/routes/story.js' "server-v7 routes 可加载"

# ===== 标准跨工单 invariant(每个工单都要跑)=====
check_no_backup_files                                     # 规则 1
check_no_luna_regression                                  # 规则 3
check_no_spillover "${EXPECTED_FILES}" "${PREVIOUS_WO_FILES}"  # 规则 2 + 6

# ===== 终结(必须最后一行)=====
verify_summary
