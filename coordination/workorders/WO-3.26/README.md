# WO-3.26 — Dev/QA Fast-Path (跳过 Activation 屏)

> **Risk-Level**: 🟡 **L2**(验收级)— 涉及 Activation 鉴权 bypass。虽然有 cookie marker 防生产滥用,但是逻辑改动而非纯样式。verify PASS → bot 自动 build + 部署 → 钉钉推 "请 Kristy 验收"。Kristy 钉钉发"通过 WO-3.26" → bot 自动 push main + 队列接力。
>
> **类型**: TV 前端 + 测试便利功能(QA 加速)
> **范围**: `tv-html/src/screens/ActivationScreen.vue` (主) + 可能 `tv-html/src/composables/*.ts/.js` (辅)
> **预估改动**: 30-60 行 JS / Vue
> **驱动事件**: 2026-05-02 Kristy 用 incognito 浏览器测试 WO-3.25 时,卡在 "Scan to let the bear meet you / activation code DEVTEST / Waiting for binding..." 屏。日常 QA 痛点:每次换浏览器都要扫码绑定 device → 选 child → 才能进 Create 屏。
>
> **流水线意义**: 自动连推机制第二单。WO-3.25 PASS 后 bot 自动派此单(因 queue.json 里 blocked_by: WO-3.25)。

---

## §1. 设计目标

加 URL query `?dev_skip_activation=1` 触发 fast-path:
- 跳过 Activation 屏
- 自动注入 fake device token + 默认 child(Dora)到 localStorage
- 直接进 Home → Create 屏

**生产防护**: 仅当浏览器 cookie 含 `wb_dev_marker=kristy_qa_2026` 时生效。普通用户不知道这个 marker 名,无法滥用。

---

## §2. 实施方向(droid 自由实施)

### Step 1 — 在 ActivationScreen.vue 的 onMounted/setup 加 fast-path 分支

```vue
<script setup>
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

onMounted(() => {
  // WO-3.26: dev/QA fast-path — 仅在 ?dev_skip_activation=1 + cookie marker 时生效
  if (route.query.dev_skip_activation === '1') {
    const hasDevMarker = document.cookie.includes('wb_dev_marker=kristy_qa_2026')

    if (hasDevMarker) {
      console.log('[WO-3.26] Dev fast-path activated (cookie marker present)')
      // 注入 fake device token (实际 key 名以现有 useDevice composable 真实使用为准)
      // 这里仅是参考,droid 看现有代码用真实 key
      localStorage.setItem('wb_device_token', 'dev-fake-token-' + Date.now())
      localStorage.setItem('wb_device_id', 'dev-fake-device')
      localStorage.setItem('wb_active_child_id', 'dev-fake-child-dora')
      localStorage.setItem('wb_active_child_name', 'Dora')

      // 跳到 home(实际 router 路径以代码现状为准)
      router.replace('/')
      return
    } else {
      console.warn('[WO-3.26] dev_skip_activation=1 requested but no dev marker cookie')
    }
  }

  // ... 原有 activation 流程
})
</script>
```

### Step 2 — 关键决策点(droid 实施时检查)

1. **localStorage key 名**: 看现有 ActivationScreen / useDevice composable 真实用的 key 名,**不要硬编码我猜的**。可能是 `device_token` / `wb_token` / `auth_token` 等
2. **child 数据结构**: 默认 child Dora 的 ID 用 `dev-fake-child-` 前缀让后端识别(也允许后端不识别 — 前端单机走通就行)
3. **路由跳转**: `router.replace('/')` 还是 `/home`,看现有 router 配置

### Step 3 — build + 写报告

报告 `/opt/wonderbear/coordination/done/WO-3.26-report.md` 包含:
- 改动文件清单
- diff
- **必须给 Kristy 的"启用步骤"**:
  ```
  Kristy 启用 dev fast-path 步骤(只设一次,以后所有浏览器/incognito 都生效):

  1. 在任意浏览器(包括 incognito)打开 tv.bvtuber.com
  2. F12 → Console → 粘贴这一行 + 回车:
     document.cookie = 'wb_dev_marker=kristy_qa_2026; path=/; max-age=31536000'
  3. 关闭浏览器,以后所有 incognito / 任何浏览器访问:
     https://tv.bvtuber.com?dev_skip_activation=1
     直接进 Home,不再卡 Activation
  ```

---

## §3. Out of Scope

- ❌ server-v7 / h5(本工单纯 TV 端)
- ❌ Activation 流程本身的逻辑(扫码、绑定 API)
- ❌ Auth / Session 系统重构
- ❌ Scrollbar(那是 WO-3.25,前置工单)

---

## §4. verify 规则

1. **dev_skip_activation 入口**: `grep 'dev_skip_activation' tv-html/src/screens/ActivationScreen.vue | wc -l ≥ 1`(排除注释)
2. **cookie marker 防护**: `grep 'wb_dev_marker' tv-html/src/screens/ActivationScreen.vue | wc -l ≥ 1`
3. **localStorage 注入**: `grep 'localStorage\.setItem' tv-html/src/screens/ActivationScreen.vue | wc -l ≥ 2`
4. **router 跳转**: `grep 'router\.\(replace\|push\)' tv-html/src/screens/ActivationScreen.vue | wc -l ≥ 1`
5. **Spillover**: 改动只在 `tv-html/src/screens/ActivationScreen.vue` 或 `tv-html/src/composables/*`
6. **Build OK**: 同 WO-3.25
7. **No backup**: 同 WO-3.25
8. **dist 含 dev_skip_activation**: `grep -o 'dev_skip_activation' tv-html/dist/assets/*.js | wc -l ≥ 1`

---

## §5. L2 自动流程

verify PASS → bot 自动:
1. `deploy-tv.sh WO-3.26` → build + cp /var/www
2. `auto-commit.sh WO-3.26 L2` → 精确 add + commit + push **release**(不 push main)
3. 钉钉推 "🟡 WO-3.26 已部署,请验收"

Kristy 验收:
1. 浏览器 console 设 cookie(README 里的命令)
2. 访问 `https://tv.bvtuber.com?dev_skip_activation=1` → 应直接进 Home
3. **OK** → 钉钉发 `通过 WO-3.26` → bot 自动 push main + 队列空 → 完成
4. **NOT OK** → 钉钉发 `回滚 WO-3.26`

---

**End of WO-3.26**
