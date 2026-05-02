# WO-3.20 完成报告 — CreateScreen 故事数全量 + bot dispatch hang 修复 + TV 部署

**From**: Factory (Droid Exec)
**To**: Kristy / Claude
**Time**: 2026-05-02 00:35 UTC
**Refs**: WO-3.20 verify (workorders/WO-3.20-verify.sh)

---

## 工单结论

✅ **9/9 PASS**(`bash workorders/WO-3.20-verify.sh` 全绿)

```
Summary: 9/9 PASS, 0 FAIL
✅ All 9 checks PASS
```

3 个 Phase 全部落地,治理基础三件套(无 .backup 残留 / 无 spillover / Luna 无回归)同步通过。

---

## 实际改动清单

### Phase 1 — CreateScreen 故事数从 3 → 50

**文件**: `tv-html/src/screens/CreateScreen.vue`
**修改**: `PAGE_SIZE = 3` → `PAGE_SIZE = 50`(并替换上方注释,保留 dev 分支不动)
**原因**: 造梦工厂之前只显示最新 3 本,孩子做了 4+ 本就发现旧故事消失。50 是 server `/story/list?limit=` 的硬上限,99 元/月 5 本订阅一年 = 60,刚好覆盖。
**diff**:`+10 / -4 lines`

### Phase 2 — factory-dispatch.js execSync hang 修复

**文件**: `dingtalk-bot/src/factory-dispatch.js`
**修改**: 给 `execSync(cmd, ...)` 调用加上:
```js
{
  encoding: 'utf8',
  shell: '/bin/bash',
  timeout: 5000,
  killSignal: 'SIGKILL',
  stdio: ['ignore', 'pipe', 'pipe'],
}
```
**try/catch**: 已经存在(老代码就有),timeout 触发会抛 `ETIMEDOUT`,被外层 catch 捕获返回 `{ ok: false, reason: '派单异常: ...' }`。**不会** 冒到 process 顶层把 bot 整个搞挂。
**原因**: 钉钉 webhook 5 秒超时;若 droid CLI 启动慢或子 shell 不退出,整个 bot 事件循环被 `execSync` 阻塞导致后续派单全卡。教训追加 candidate 见末尾。
**diff**:`+12 / -1 lines`
**bot 重启**: `pm2 restart wonderbear-dingtalk`,等 5s 后 `pm2 jlist` 显示 `online`,启动日志看到 `[BOOT]` / `[READY] DingTalk Stream connected`,没有错误。

### Phase 3 — TV build 部署

**build**:`cd tv-html && npm run build`(`vue-tsc --noEmit && vite build`),0 error,210 modules,产物如下:
```
dist/index.html                        1.17 kB │ gzip: 0.66 kB
dist/assets/GalleryView-CGeRkKiJ.css   2.94 kB │ gzip: 1.00 kB
dist/assets/index-Du9TUwV3.css        82.89 kB │ gzip: 14.12 kB
dist/assets/GalleryView-CywMRKim.js    6.51 kB │ gzip: 3.43 kB
dist/assets/index-C8N7WreW.js        320.09 kB │ gzip: 111.61 kB
✓ built in 6.96s
```
**deploy**:
- `cp dist/index.html /var/www/wonderbear-tv/index.html`
- `rsync -av --delete dist/assets/ /var/www/wonderbear-tv/assets/`(清理了 2 个旧 GalleryView js chunk)
- `rsync -av dist/fonts/ /var/www/wonderbear-tv/fonts/`(无变化)

`/var/www/wonderbear-tv/index.html` mtime = `2026-05-02 00:33:10 UTC`,在 verify 30 分钟窗口内。

---

## verify 脚本修正(同捎带)

**问题**: 工单初版 `workorders/WO-3.20-verify.sh` 调用了 `init_verify` / `pass` / `fail` / `check_file_contains` / `check_file_not_contains` / `finalize_verify` 这 6 个函数 —— `verify-lib.sh` v3 里**全部不存在**,直接跑会 `command not found` 然后 `exit 0` 假绿(set -uo pipefail 不抓 command-not-found)。

**修正**: 用 lib v3 实际 API 重写:
- `init_verify` → 直接 `echo` 标题 + 把 `WO_ID` / `EXPECTED_FILES` 设成 lib 期望的形态
- `check_file_contains pat file desc` → `check_pattern_in_file pat file desc`(顺序保持一致)
- `check_file_not_contains pat file desc` → `check_pattern_absent_in_file`
- 自定义 pm2 / mtime 检查段保留,改用 `check_pass` / `check_fail` + `TOTAL=$((TOTAL+1))`(lib 暴露的计数器)
- `check_no_spillover "WO-3.20" "<空格分隔路径串>"` → `check_no_spillover '<regex>' '<prev-wo-regex>'`(参数都是 regex,不是 ID 或路径列表)
- `finalize_verify` → `verify_summary`

**改后行数**: 76 行(原 60 行有效)。bash -n 通过,**9/9 PASS**。

---

## 文件 spillover 自检

```
git status -s:
 M dingtalk-bot/src/factory-dispatch.js   ← Phase 2
 M tv-html/src/screens/CreateScreen.vue   ← Phase 1
?? coordination/workorders/WO-3.20/       ← 工单本身(派单时已 untracked)
?? workorders/WO-3.20-verify.sh           ← 修正后的 verify
```

无意外文件被改。Phase 3 的 `/var/www/wonderbear-tv/` 不在 git 仓库里(部署目标),不进 status。

---

## Risk 出现

- **Risk-A: bot 重启窗口**:在 00:32 UTC(凌晨 8:32 CST,Kristy 通常已睡)重启,onboarding 看到正常 `[BOOT]` / `[KNOWLEDGE]` / `[FACTORY] 5 个未消化报告` / `[DONE-WATCHER]` / `[READY]` 全栈,无消息丢失迹象。一条 `[FACTORY]` 提示有 5 个未消化报告(WO-3.16-combo / 3.16.1 / 3.17 / 3.18 / 3.19)是历史状态,**不是**本次重启造成。
- **Risk-B: TV 客户端缓存**:GP15 WebView 需要重启 / 强刷才能拿到新 index.html(老的 hash 走旧 chunk)。这是已知行为,不在本工单 scope。
- **Risk-C: 工单 README.md 是 stale 的 WO-3.17 副本**:`coordination/workorders/WO-3.20/README.md` 内容是 WO-3.17 的治理工单文案(顶部标题 "WO-3.17"),与 verify 脚本描述不符。Droid 以 verify 脚本为权威推断了实际 3 个 Phase 的范围。建议下次派单时同步刷新 README.md。
- 无敏感凭据告警(改动不接触 .env / api key / secret)。

---

## 教训追加 candidate

```
[LESSON_CANDIDATE]
标题: Node child_process.execSync 默认无 timeout 会阻塞整个事件循环
场景: bot / orchestrator 在主进程同步 fork 子 shell 拿 PID,若子 shell 因 droid CLI 启动慢
      / 等 stdin / 外部依赖卡死,event loop 被冻结,钉钉 webhook 5s 超时整个 bot 派单卡死。
解决: execSync 加 { timeout: 5000, killSignal: 'SIGKILL', stdio: ['ignore','pipe','pipe'] }
      并保留外层 try/catch。timeout 抛 ETIMEDOUT 被捕获,bot 主循环不卡。
      更彻底是改用 spawn + detached + unref,但本工单维持 execSync 最小改动。
```

```
[LESSON_CANDIDATE]
标题: verify 脚本调用不存在函数会假绿(set -uo pipefail 不抓 command-not-found)
场景: 工单 verify 脚本调用了不在 verify-lib.sh 里的 wrapper(init_verify/pass/fail/...),
      bash 报 command not found 但 exit code 仍是 0,verify 看似全绿实则没真测。
解决: 1) 写 verify 前 grep verify-lib.sh 确认函数名;
      2) verify-lib.sh 末尾加 set -e 在 source 时立即检查 lib API;
      3) 或在 verify-template.sh 里固定调用 lib 已有函数(check_pattern_in_file 等)。
```

---

## 建议下一工单

基于本次治理结果,建议:

1. **WO-3.20.1(可选小补丁)**:把 `coordination/workorders/WO-3.20/README.md` 替换成与 verify 脚本一致的真 README(明确 Phase 1/2/3 范围),避免后续 Droid 接同样工单时再被 stale 文案误导。
2. **verify-lib.sh v4 alias 兼容**:lib 里加 `init_verify` / `pass` / `fail` / `check_file_contains` / `check_file_not_contains` / `finalize_verify` 作为 v3 函数的薄 alias,这样万一未来 verify 又用旧名,也能跑起来不假绿(完全消除上面教训 2)。
3. **WO-3.19 主角链路**(已在分支 head)若还有 follow-up,可与 PAGE_SIZE = 50 联动测试:
   现在 CreateScreen 一次拉 50 本,如果 server `/story/list` 在 limit=50 下排序/分页有 bug,UI 层会立即暴露。
4. **memory #21 5 个产品反馈**:依然待拆(WO-3.17 计划里的 carry-over,本工单未触碰)。

---

**End of report.**
