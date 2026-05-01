#!/bin/bash
# WO-3.16-combo collect script
# 用于失败时取证,贴回对话给 Claude 判断假 FAIL vs 真 FAIL

REPO=/opt/wonderbear
TV=$REPO/tv-html

cd "$TV" || { echo "❌ tv-html 不存在"; exit 2; }

echo "========================================="
echo "WO-3.16-combo collect (取证脚本)"
echo "========================================="

echo
echo "########## A. 涉及文件实际行数 ##########"
wc -l src/screens/DialogueScreen.vue src/App.vue 2>/dev/null
[ -f src/components/GlobalBackButton.vue ] && wc -l src/components/GlobalBackButton.vue || echo "(GlobalBackButton.vue 不存在)"

echo
echo "########## B. git diff 改动统计 ##########"
git diff --stat HEAD -- src/screens/DialogueScreen.vue src/App.vue src/components/GlobalBackButton.vue 2>/dev/null

echo
echo "########## C. Part A 关键点 ##########"
echo "--- onVoiceKeyDown 函数(±5 行)---"
grep -B 1 -A 30 "function onVoiceKeyDown\|onVoiceKeyDown\s*=" src/screens/DialogueScreen.vue 2>/dev/null | head -50
echo
echo "--- AbortController 用法 ---"
grep -n "AbortController" src/screens/DialogueScreen.vue 2>/dev/null

echo
echo "########## D. Part B 关键点 ##########"
echo "--- pressDownTimer 用法 ---"
grep -n "pressDownTimer" src/screens/DialogueScreen.vue 2>/dev/null
echo
echo "--- 200 ms 去抖时长 ---"
grep -n "200\|DEBOUNCE" src/screens/DialogueScreen.vue 2>/dev/null | head -10

echo
echo "########## E. Part C 关键点 ##########"
echo "--- GlobalBackButton.vue 内容预览(前 80 行)---"
head -80 src/components/GlobalBackButton.vue 2>/dev/null
echo
echo "--- App.vue 中的 GlobalBackButton 引用 ---"
grep -B 1 -A 3 "GlobalBackButton" src/App.vue 2>/dev/null

echo
echo "########## F. spillover 检查 ##########"
echo "禁区文件 git diff(应该全部为空)"
for f in src/stores/dialogue.ts src/stores/screen.ts src/services/bridge/index.ts src/services/bridge/mock.ts src/services/bridge/types.ts src/services/api.ts; do
  if [ -f "$f" ]; then
    if ! git diff --quiet HEAD -- "$f" 2>/dev/null; then
      echo "⚠️  $f 被修改:"
      git diff --stat HEAD -- "$f" 2>/dev/null
    fi
  fi
done

echo
echo "########## G. backup 文件状态 ##########"
echo "--- src/screens 中是否仍有 backup 文件 ---"
find src/screens/ -name "*.backup*" -o -name "*.bak" 2>/dev/null
echo "--- src/i18n 中是否仍有 backup 文件 ---"
find src/i18n/ -name "*.backup*" -o -name "*.bak" 2>/dev/null

echo
echo "########## H. 最近 git log ##########"
git log --oneline -5 2>/dev/null

echo
echo "========================================="
echo "collect 完成,把以上输出贴回对话窗口给 Claude"
echo "========================================="
