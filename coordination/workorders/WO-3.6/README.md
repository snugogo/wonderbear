# WO-3.6: 删主题卡 + 加 UI 话筒按钮(Standard)

> **创建时间**: 2026-04-30
> **派给**: Factory(claude-opus-4-7, --auto high)
> **预计执行**: 30-45 分钟
> **类型**: Standard 三件套(.md + verify.sh + collect.sh)
> **Parent commit**: `07a8eff`(WO-3.1-mini)
> **改动范围**: tv-html/src/screens/DialogueScreen.vue + i18n 文件
> **改动量预估**: ~150 行(删 80 行主题卡 + 加 50 行按钮 + 20 行 i18n)
> **依赖**: WO-3.1-mini 已闭环 ✅

---

## §1. 背景

### 上一个 WO 完成后的 prod 状态
- Server-v7 HEAD: `07a8eff`(WO-3.1-mini GeneratingScreen TIMEOUT 600s 已生效)
- tv-html dist 已 rsync 到 `/var/www/wonderbear-tv/`(Apr 30 09:09)
- working tree: 干净(WO-3.1-mini commit 后)

### WO-3.6 要解决两个独立的产品缺陷

**缺陷 A: 4 格主题卡(Forest / Ocean / Space / At Home)— 已废弃但代码还在 mainline**
- 当前浏览器实测显示:DialogueScreen 渲染 4 个主题卡(`Question 1 of 7` 旁边)
- **产品决策:废弃 4 格主题(WO-3.6 之前已决定,但代码未删除)**
- 留着会让用户产生"必须选主题才能开始"的误解,与"对话式自由编故事"的核心体验冲突

**缺陷 B: 没有 UI 话筒按钮 — 平板 / PC 浏览器无法使用产品**
- 当前唯一录音触发途径:bridge `voice-key-down` event(GP15 物理键 / 蓝牙遥控)
- PC Chrome / 平板 → 没有触发途径 → **完全无法使用产品**
- 海外市场(Poland / Romania / USA)早期推广主要靠 PC / 平板,**没有 UI 话筒按钮 = 无法演示 = 无法销售**

### 历史背景(给 Factory 看)

`stash@{0}` 里有 W5 调试代码(141 行),**实现思路对**(浮动 UI 按钮 + 触发 voice-key-down emit),但**实现方式是临时调试态**:
- 红色"按住说话"按钮(产品视觉不符)
- 大量 `console.log('[debug-asr] ...')`
- `<div class="scenes-grid" v-if="false">` 隐藏主题卡(WO-3.6 任务是**真删主题卡**,不是隐藏)
- 硬编码英文文案(应走 i18n)

**WO-3.6 不许 stash pop**(避免引入污染)— 参考 stash 思路重新写产品级实现。

---

## §2. 改动列表

### §2.1 改动 1: 删除 4 格主题卡相关代码

**文件**: `tv-html/src/screens/DialogueScreen.vue`

**删除范围(基于 grep 结果,具体行号 Factory 勘察后确认)**:

| 类型 | grep 关键字 | 大致位置 |
|---|---|---|
| script 注释 | `Space card uses bg_bedtime` | line ~507 |
| script ref 声明 | `sceneForestRef`, `sceneOceanRef`, `sceneSpaceRef`(还可能有 `sceneHomeRef`) | line 514-516+ |
| script useFocusable 调用 | `useFocusable(sceneForestRef, ...)` 等 4 处 | line 600-611+ |
| template HTML | `<div class="scene-card" ref="sceneForestRef">` 等 4 处 | line 865+ |
| template 包裹容器 | `<div class="scenes-grid">...</div>` | template 块 |
| CSS 样式 | `.scene-card`, `.scenes-grid` | style 块 |

⚠️ **注意:** 不仅删 4 格主题卡渲染,还要**删除主题卡相关 store 调用**(如果 onEnter 里有 `dialogue.startWithTheme('forest')` 之类)。

**勘察命令(Factory 必跑)**:
```bash
grep -nE 'scene[A-Z][a-z]+Ref|sceneForest|sceneOcean|sceneSpace|sceneHome|scenes-grid|scene-card|startWithTheme|themeId|sceneTheme' src/screens/DialogueScreen.vue | head -40
```

### §2.2 改动 2: 加产品级 UI 话筒按钮

**文件**: `tv-html/src/screens/DialogueScreen.vue`

**新增内容**:

1. **template 新增**(放在 .dialogue-screen 容器底部):
```vue
<button
  type="button"
  class="mic-button"
  :class="{ pressed: micPressed }"
  :aria-label="t('dialogue.micButton.aria')"
  @mousedown="onMicDown"
  @mouseup="onMicUp"
  @mouseleave="onMicUp"
  @touchstart.prevent="onMicDown"
  @touchend.prevent="onMicUp"
  @touchcancel.prevent="onMicUp"
>
  {{ micPressed ? t('dialogue.micButton.recording') : t('dialogue.micButton.idle') }}
</button>
```

2. **script setup 新增**:
```typescript
import { emit as bridgeEmit } from '@/services/bridge/pushBus';

const micPressed = ref(false);

function onMicDown(): void {
  if (micPressed.value) return;
  micPressed.value = true;
  bridgeEmit('voice-key-down');
}

function onMicUp(): void {
  if (!micPressed.value) return;
  micPressed.value = false;
  bridgeEmit('voice-key-up');
}
```

**关键设计(必须遵守)**:
- ✅ 走 `bridgeEmit('voice-key-down')` 跟 GP15 物理键统一路径
- ✅ 不绕过 bridge 直接调 ASR(保证 GP15 真硬件兼容)
- ✅ 6 个鼠标/触摸事件全监听(防止鼠标拖出按钮卡死)
- ✅ touch 事件加 `.prevent` 防止移动端选中文本

### §2.3 改动 3: CSS 样式(产品级)

**文件**: `tv-html/src/screens/DialogueScreen.vue`(`<style scoped>` 末尾)

```css
/*
 * WO-3.6: UI 话筒按钮(平板/PC 支持)
 * 浮动右下角圆形按钮,跟 GP15 物理键平行触发 voice-key-down/up bridge event
 */
.mic-button {
  position: fixed;
  right: 32px;
  bottom: 32px;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--c-amber);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 14px;
  font-weight: 700;
  border: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  z-index: 9999;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: transform var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
.mic-button.pressed {
  background: var(--c-amber-deep, #d97706);
  transform: scale(0.92);
}
.mic-button:focus {
  outline: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45),
              0 0 0 4px var(--c-focus-soft);
}
```

⚠️ **CSS token 勘察(Factory 必跑)**:
```bash
grep -nE '\-\-c-amber|\-\-c-cream|\-\-c-focus|\-\-ff-display|\-\-t-fast|\-\-ease-out' src/styles/*.css 2>/dev/null | head -20
```

如果 `--c-amber` 等不存在,Factory 选最接近的 token(参考 GeneratingScreen.vue 的 `var(--c-focus)` / `var(--c-cream)`)。

### §2.4 改动 4: i18n 新增 keys

**文件**: `tv-html/src/i18n/zh.ts` 或 `zh-CN.ts`(Factory 勘察确认)

```typescript
dialogue: {
  // ... 现有 keys 保留
  micButton: {
    idle: '按住说话',
    recording: '正在听...',
    aria: '按住说话录音',
  },
}
```

**文件**: `tv-html/src/i18n/en.ts`

```typescript
dialogue: {
  // ... 现有 keys 保留
  micButton: {
    idle: 'Hold to talk',
    recording: 'Listening...',
    aria: 'Hold to record voice',
  },
}
```

⚠️ **i18n 勘察(Factory 必跑)**:
```bash
ls tv-html/src/i18n/
grep -nE 'dialogue.*:' tv-html/src/i18n/*.ts | head -10
```

### §2.5 改动 5: 删除关联 i18n keys(主题卡相关)

如果 i18n 里有主题卡名称 key(如 `dialogue.scenes.forest`, `dialogue.scenes.ocean` 等),**一并删除**。

```bash
grep -nE 'scenes:|forest:|ocean:|atHome:|holdMicWithScenes' tv-html/src/i18n/*.ts | head -20
```

`holdMicWithScenes` key(如果存在,文案是"Hold the mic to talk, or pick a theme")要改回去无主题版本:
- `dialogue.holdMic = '按住说话讲故事'` / `'Hold the mic to tell a story'`
- 或者直接删,因为 mic-button 自身有文字就够了

具体看 i18n 实际结构,Factory 决定。

---

## §3. 红线

- ❌ 不许 git push 任何分支
- ❌ 不许 pm2 restart(Kristy 只跑 npm build + rsync,无需 server reload)
- ❌ 不许 stash pop(stash@{0} 留着,产品决策已不需要它)
- ❌ 不许 mock 兜底
- ❌ 不许 `&&` 命令链
- ❌ 不许 ssh heredoc 嵌套引号(用 stdin 文件)
- ❌ 不许 "Always allow" 任何权限提示
- ❌ **不许保留任何 4 格主题卡代码**(template / script / CSS / i18n 全删)
- ❌ 不许在 mainline 留任何 `console.log('[debug-asr]')` 或类似调试日志
- ❌ 不许动 `bridge.on('voice-key-down', ...)` 现有监听器(只新增 emit 触发器)
- ❌ 不许动 GeneratingScreen.vue(WO-3.1-mini 刚改完,不要碰)
- ❌ 不许动 ASR 链路(WO-1 已稳定)

**改动总行数硬上限**: 200 行(删 80 + 加 100 + 余量 20)。超 200 行**立刻停下报告**。

---

## §4. 备份纪律

```bash
ssh wonderbear-vps "
cd /opt/wonderbear/tv-html
cp src/screens/DialogueScreen.vue src/screens/DialogueScreen.vue.backup-2026-04-30-wo3.6-pre
"
```

i18n 文件改前也备份(Factory 勘察确定具体文件名后):
```bash
ssh wonderbear-vps "
cd /opt/wonderbear/tv-html
cp src/i18n/zh.ts src/i18n/zh.ts.backup-2026-04-30-wo3.6-pre
cp src/i18n/en.ts src/i18n/en.ts.backup-2026-04-30-wo3.6-pre
"
```

⚠️ tv-html backup 文件 `.git/info/exclude` 已加 `tv-html/src/screens/*.backup-*` 规则(WO-3.1-mini 时加),但**不覆盖** i18n 文件路径。Factory 勘察后如果改 i18n,**追加** `tv-html/src/i18n/*.backup-*` 规则。

---

## §5. Dry-run 校验

改动完成后 Factory 必跑:

```bash
cd /opt/wonderbear/tv-html
npm run build 2>&1 | tail -20
```

**预期**:
- vue-tsc 类型检查通过
- vite build 通过
- dist/ 输出新 index-XXX.js

如有 TS 错误 → Factory 调试 + 报告;不要 force build。

---

## §9. 验收

### §9.1 自动验证(verify.sh 跑)

详见 `WO-3.6-verify.sh`。post 模式 8 项检查:
1. backup 文件存在
2. 4 格主题卡代码完全删除(template / script / CSS)
3. UI 话筒按钮代码新增到位(template + script + CSS)
4. bridge.emit 调用存在(走统一路径)
5. 没有 console.log 调试污染
6. i18n key 新增 + 旧 key 删除
7. npm run build 成功
8. dist 时间戳更新

### §9.2 人工改 .env(本工单**无需** .env 改动)

跳过。

### §9.3 pm2 restart 验证(本工单**无需** pm2 操作)

tv-html 是静态文件,不涉及 server。跳过。

### §9.4 浏览器实测(Kristy 跑)

1. `rsync -av --delete /opt/wonderbear/tv-html/dist/ /var/www/wonderbear-tv/`
2. Chrome 强制刷新(Ctrl+Shift+R)
3. 进入 DialogueScreen
4. **看右下角应有 amber 圆形话筒按钮**
5. **看 4 格主题卡完全消失**(只剩小熊 + Question N of 7 + 引导文案 + 按钮)
6. **按一下按钮 → 不必真说话**(避免触发 ASR + 故事生成 = 烧钱 $0.92)
7. **松开按钮 → 看屏幕状态切换**(从 waiting-for-child → recording → uploading)
8. **状态机走起来 = UI 按钮触发链路打通**
9. **不必跑完整生成**(状态切换说明触发链路 OK,生成功能跟 WO-1 已验证链路一样)

---

## §10. 回滚

### 10.1 改坏了 build 失败 / Factory 跑歪

```bash
ssh wonderbear-vps "
cd /opt/wonderbear/tv-html
cp src/screens/DialogueScreen.vue.backup-2026-04-30-wo3.6-pre src/screens/DialogueScreen.vue
cp src/i18n/zh.ts.backup-2026-04-30-wo3.6-pre src/i18n/zh.ts 2>/dev/null
cp src/i18n/en.ts.backup-2026-04-30-wo3.6-pre src/i18n/en.ts 2>/dev/null
npm run build 2>&1 | tail -10
"
```

### 10.2 已 commit 但想撤销

```bash
ssh wonderbear-vps "cd /opt/wonderbear && git reset --hard 07a8eff"
```

`07a8eff` = WO-3.1-mini commit hash,WO-3.6 的 parent。

---

## 派单 SOP(Standard 工单 v2)

### 1. 上传 + 配置

```bash
scp /c/Users/Administrator/Downloads/WO-3.6.md \
    /c/Users/Administrator/Downloads/WO-3.6-verify.sh \
    /c/Users/Administrator/Downloads/WO-3.6-collect.sh \
    wonderbear-vps:/opt/wonderbear/workorders/

ssh wonderbear-vps "
sed -i 's/\r\$//' /opt/wonderbear/workorders/WO-3.6*.sh
chmod +x /opt/wonderbear/workorders/WO-3.6*.sh
mkdir -p /opt/wonderbear/coordination/workorders/WO-3.6
cp /opt/wonderbear/workorders/WO-3.6.md /opt/wonderbear/coordination/workorders/WO-3.6/README.md
ls -la /opt/wonderbear/workorders/WO-3.6*
"
```

### 2. 派 Factory

```
钉钉发: 派 WO-3.6
```

### 3. 收 Factory 报告 + verify

```bash
ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.6-collect.sh"
ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.6-verify.sh"
echo "exit code: $?"
```

### 4. 失败处理(SPEC v2 §标准用法)

- exit 0 → §9.4 浏览器实测
- exit 非 0 → 把输出贴回 Claude 判断 A/B/C 类失败

---

## §11. commit message 模板(成功后用)

```
fix(tv): WO-3.6 remove deprecated theme cards + add UI mic button

Two product decisions resolved:
1. 4-grid theme cards (Forest/Ocean/Space/AtHome) deprecated; UI now matches
   "free-form story-telling" core experience.
2. UI mic button added so the product runs on tablets and PC browsers
   without a Bluetooth remote (海外市场 / 平板演示场景).

Implementation: button uses bridgeEmit('voice-key-down'/'voice-key-up')
to share path with GP15 hardware keys. No fork in dialogue state machine.

Build verified (npm run build OK), rsynced to /var/www/wonderbear-tv.
Browser smoke test: button triggers state machine; no full-gen test
(would cost $0.92).
```

---

完。
