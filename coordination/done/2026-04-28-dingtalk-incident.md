# 钉钉机器人 incident 修复报告

**Time**: 2026-04-28 ~15:13 VPS time
**Reporter**: VPS Claude (本地巡检发现)
**Severity**: P1 (机器人 silent down,Kristy 无法跟 bot 对话)
**Status**: ✅ 已修复,运行中

---

## 1. 现象

巡检 `pm2 list`:
```
wonderbear-dingtalk    errored    32 次重启
wonderbear-server      online     17m
```

`pm2 logs wonderbear-dingtalk --err`:
```
SyntaxError: Unexpected identifier 'cat'
  at /opt/wonderbear/dingtalk-bot/src/index.js:235
```

---

## 2. 根因

`buildPrompt()` 函数的 sysHint 是个模板字符串(line 207-240),里面 line 235 写着:
```
1. 读 LESSONS.md (`cat /opt/wonderbear/dingtalk-bot/LESSONS.md`)
```

文档示例里的反引号没有 escape,JS 解析器把它当外层 template literal 的结束符,后面的 `cat ...` 成了裸标识符 → SyntaxError。

启动即崩 → PM2 自动重启 32 次都失败 → silent down。

---

## 3. 修复

`/opt/wonderbear/dingtalk-bot/src/index.js:235`:

**Before**:
```
1. 读 LESSONS.md (`cat /opt/wonderbear/dingtalk-bot/LESSONS.md`)
```

**After**:
```
1. 读 LESSONS.md (\`cat /opt/wonderbear/dingtalk-bot/LESSONS.md\`)
```

---

## 4. 验证

- ✅ `node --check src/index.js` → SYNTAX OK
- ✅ `pm2 restart wonderbear-dingtalk --update-env` → online,pid 3872465
- ✅ pm2 out 日志:
  - `[KNOWLEDGE] CLAUDE.md loaded: 3280 chars`
  - `[KNOWLEDGE] LESSONS.md loaded: 2036 chars`
  - `[KNOWLEDGE] STATUS.md loaded: 2286 chars`
  - `[FACTORY] 5 个未消化报告: ...`
  - `[READY] DingTalk Stream connected`
  - `Socket open`
- ✅ 11s+ uptime stable,无新错

---

## 5. 未做(留 Kristy 决策)

**没 commit 这次 fix**。原因:

- `git diff dingtalk-bot/src/index.js` 显示这个文件还有 v0.9 (status-aware) 的整套改动(slim sysHint 重写、status-helper 引入、boot 扫 Factory 报告等),全部还在 working tree 里没 commit
- 这是别人(可能是钉钉 Claude 自己,或 Kristy 派的另一个 droid)的 in-progress 工作,我不该替你拍板把整个 bundle commit 进 git history
- 但**这意味着风险**:谁要是 `git checkout -- dingtalk-bot/src/index.js`,backtick fix + v0.9 整套都没了,机器人下次重启又崩

**建议**: Kristy 看一眼 `git diff dingtalk-bot/src/index.js`,觉得 v0.9 整套 OK 就一起 commit;或者只 commit 我的 backtick fix,把 v0.9 其余改动留给原作者收尾。

相关 untracked 文件(v0.9 配套,可能要一起进):
- `dingtalk-bot/src/status-helper.js` (新模块,index.js 已 require)
- `dingtalk-bot/STATUS.md` (运行时读)
- `dingtalk-bot/push-knowledge.sh` (新脚本)
- `dingtalk-bot/push-lessons.sh.deprecated` (旧脚本 rename)
- `dingtalk-bot/push-lessons.sh` 在 git status 是 D (已删) — 配套 deprecated rename

---

## 6. 教训(供 LESSONS.md 收录)

**标题**: 模板字符串里写反引号示例必须 escape
**场景**: JS template literal 内嵌"用反引号包代码"的文档/示例时
**解决**:
- 反引号必须 escape: `` \` ``
- 或者改用单引号包代码: `'cat ...'`
- 大改 prompt 字符串后,**必须** `node --check` 一遍再 commit/restart;PM2 重启循环属于 silent failure

**附加教训**:
- `pm2 list` 里 `errored` 状态 + 高 ↺ 数(>5)= silent down,巡检必看
- v0.x → v0.x+1 改动,即使只是文案修改,也要 syntax check + 至少跑一次 boot
- Factory droid 改完代码不验 boot 直接走人,这种 regression 100% 复现

---

**By**: VPS Claude (afternoon 巡检)
**Refs**: AGENTS.md §2 (备份/单独命令/失败回滚)
