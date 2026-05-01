# Workorder W5: Remove four theme cards from DialogueScreen.vue

**From**: Claude (review officer)
**To**: Factory droid
**Time**: 2026-04-30 04:00
**Branch**: release/showroom-20260429
**Repo**: /opt/wonderbear/tv-html
**Auto level**: high
**Timeout**: 1800s
**Workorder ID**: 2026-04-30-tv-w5-remove-theme-cards

---

## 背景 / 目标

当前 prod 的 DialogueScreen 显示 "Question 1 of 7" + 四个主题方块(Forest / Ocean / Space / At Home)。
四个主题方块是**老 UI 残留**,Kristy 之前已经删过一次,Track B v7.2 cherry-pick 时又被带回来了。

展会前必须删掉这四块,因为客户面前会丑。

**目标**:删掉四个主题方块的渲染,**不破坏**对话状态机(`waiting-for-child` / `recording` / `uploading` / `bear-speaking` 等)。

底部"Hold the mic to talk, or pick a theme for the bear to tell"文案改为只说"Hold the mic to talk"(因为已经没有 theme 可 pick)。

---

## RED LINES

```
❌ DO NOT modify any other .vue file
❌ DO NOT modify src/services/bridge/* (bridge 路径)
❌ DO NOT modify the [debug-asr] floating button or its handlers (那是 ASR 调试用)
❌ DO NOT modify the dialogue state machine logic (onVoiceKeyDown / onVoiceKeyUp / submitTurn 等不动)
❌ DO NOT modify the existing useFocusable registrations for sceneForestRef / sceneOceanRef / sceneSpaceRef
   (注释掉的话焦点系统会找不到 ref,可能报警告;先保留这些 useFocusable 调用,只删除模板渲染)
❌ DO NOT git commit / push
❌ DO NOT 装新 npm 包
```

---

## 必做事项

### Phase 0: 侦察 — 锁定四个主题方块的模板位置

```bash
cd /opt/wonderbear/tv-html
echo "=== 侦察主题方块模板 ==="
sed -n '940,985p' src/screens/DialogueScreen.vue
echo ""
echo "=== 侦察底部文案 ==="
sed -n '1480,1510p' src/screens/DialogueScreen.vue
echo ""
echo "=== useFocusable 注册位置(必须保留) ==="
grep -n "useFocusable.*scene" src/screens/DialogueScreen.vue
echo ""
echo "=== ref 声明位置(保留,代码可能其他地方引用) ==="
grep -n "sceneForestRef\|sceneOceanRef\|sceneSpaceRef" src/screens/DialogueScreen.vue
```

报告这些输出。

### Phase 1: 删除四个主题方块的模板渲染

在 `src/screens/DialogueScreen.vue` 中:

**找到包含 4 个主题方块的 `<div>` 容器**(根据 Phase 0 侦察确认),用 `<!-- W5: removed per Kristy ... -->` 替换整个容器内容。

**两种安全做法,二选一**(根据 Phase 0 侦察的实际结构决定哪个更安全):

**做法 A — 注释包裹整个 grid**:如果四个方块在一个独立的 `<div class="theme-grid">` 容器里,用 HTML 注释把整个 grid 块包起来:
```vue
<!-- W5: theme cards removed for showroom 2026-04-30 — Kristy decision
<div class="theme-grid">
  ...原 4 个主题块...
</div>
-->
```

**做法 B — `v-if="false"`**:如果四个方块跟其他元素混在同一个父 div 里,给 grid 容器加 `v-if="false"`:
```vue
<div class="theme-grid" v-if="false">
  ...原 4 个主题块...
</div>
```

选择原则:
- 做法 A 完全不渲染,vite 编译时也跳过(更彻底)
- 做法 B 保留代码但不显示(回滚最快,改 false → true)
- **推荐做法 B**,因为对话状态机可能在某些状态下需要这些 ref 存在(虽然 useFocusable 注册保留了)

如果两种做法你不确定哪种更安全,**选做法 B**,展会后再彻底清理。

### Phase 2: 改底部文案

找到 1480-1510 行的"Hold the mic to talk, or pick a theme for the bear to tell"那段文案,改为:

**改造前**(假设):
```
Hold the mic to talk, or pick a theme for the bear to tell
```

**改造后**:
```
Hold the mic to talk
```

如果文案是中文版的,做对应中文调整(去掉"或选择主题"那部分)。
如果文案是 i18n key 引用,**不要改 i18n 文件**,在 template 直接换成硬编码 "Hold the mic to talk"(展会版临时简化)。

### Phase 3: build

```bash
cd /opt/wonderbear/tv-html
npm run build 2>&1 | tail -20
```

**期望**:`✓ built in Xs`,exit 0,新的 `dist/assets/index-*.js` bundle 生成。

### Phase 4: bundle 自检

```bash
cd /opt/wonderbear/tv-html
echo "=== 新 bundle 文件 ==="
ls -la dist/assets/index-*.js
echo ""
echo "=== 'Forest' 'Ocean' 'Space' 'At Home' 是否还在 bundle ==="
grep -c "Forest\|Ocean\|At Home" dist/assets/index-*.js
echo ""
echo "=== 'Hold the mic to talk' 文案是否在 bundle ==="
grep -l "Hold the mic to talk" dist/assets/index-*.js
echo ""
echo "=== '按住说话' (debug ASR button) 是否仍在 bundle ==="
grep -l "按住说话" dist/assets/index-*.js
echo ""
echo "=== 'debug-asr' 是否仍在 bundle ==="
grep -l "debug-asr" dist/assets/index-*.js
```

**期望**:
- 新 bundle 存在
- 如果用做法 A(注释删除):"Forest" / "Ocean" 等字串应该 **不在** bundle 里(grep -c = 0)
- 如果用做法 B(v-if false):"Forest" 等字串**仍在**(因为代码留着),但运行时不渲染 — 这是预期的
- "Hold the mic to talk" 在 bundle ✅
- "按住说话" 在 bundle ✅(ASR 调试按钮保留)
- "debug-asr" 在 bundle ✅

任何 ASR 调试按钮相关的 grep 失败 → **立即停止报告**(说明 W5 误删了 ASR 按钮)。

### Phase 5: 部署 dist 到 prod

```bash
cd /opt/wonderbear/tv-html
sudo cp -r /var/www/wonderbear-tv /var/www/wonderbear-tv.bak-w5-$(date +%Y%m%d-%H%M%S)
sudo cp -r dist/* /var/www/wonderbear-tv/

echo "=== 部署后验证 ==="
ls -la /var/www/wonderbear-tv/assets/ | head -10
grep -oE "index-[A-Za-z0-9]+\.js" /var/www/wonderbear-tv/index.html
```

**期望**:`index.html` 引用的 bundle 文件名跟 Phase 4 看到的新 bundle 一致。

### Phase 6: 报告(到 /opt/wonderbear/coordination/done/2026-04-30-tv-w5-report.md)

报告必须包含:
1. Phase 0 侦察输出
2. 选了做法 A 还是 B,为什么
3. `git diff src/screens/DialogueScreen.vue` 输出(限 100 行内,如果太长 stat + 关键 hunks)
4. Phase 3 build 输出
5. Phase 4 bundle 自检全部输出
6. Phase 5 部署后验证输出
7. `git status -s` 输出
8. 自我审查清单:
   - [ ] 没改其他 .vue 文件
   - [ ] 没改 bridge/*
   - [ ] 没改 [debug-asr] 按钮和 handlers
   - [ ] 没改 onVoiceKeyDown / onVoiceKeyUp / submitTurn 状态机逻辑
   - [ ] useFocusable 注册保留(不删 ref 注册以避免警告)
   - [ ] 没 git commit / push
   - [ ] build 成功,新 bundle 在 prod

### Phase 7: 停止

完成 Phase 6 后停止。

---

## 回滚命令(如果展会现场翻车)

```bash
sudo cp -r /var/www/wonderbear-tv.bak-w5-* /var/www/wonderbear-tv/
```

(找到最近一次 W5 备份,覆盖回去)

---

**End of W5.**
