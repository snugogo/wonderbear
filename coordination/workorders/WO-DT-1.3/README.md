# WO-DT-1.3 (v2): done-watcher 自动跑 verify + 推钉钉

> **创建时间**: 2026-04-30 (v2 出于 v1 失败修复)
> **派给**: Factory(claude-opus-4-7, --auto high)
> **预计执行**: 25-35 分钟
> **类型**: Standard 三件套（同名覆盖 v1）
> **Parent commit**: `f420313`（WO-3.6 commit）
> **改动范围**: dingtalk-bot 的 done-watcher / index.js
> **改动量预估**: ~60 行（v1 是 56 行，v2 多约 4 行加固）

---

## §1. 背景

### v1 失败分析（2026-04-30 11:00 UTC）

WO-DT-1.3 v1 派 Factory 跑完，verify 7/7 全过，但 **Kristy 跑 `pm2 restart wonderbear-dingtalk` 后 dingtalk-bot 启动崩溃**：

```
/opt/wonderbear/dingtalk-bot/src/index.js:235
1. 读 LESSONS.md (`cat /opt/wonderbear/dingtalk-bot/LESSONS.md`)
                  ^^^
SyntaxError: Unexpected identifier 'cat'
```

**根因**：Factory 在 verify 失败时给用户的钉钉消息里嵌入了多行 markdown 文档（"建议: 把以上贴 Claude 判断 A/B/C..."），但**字符串引号没正确闭合 / 没用模板字符串**，导致 markdown 内容（如 `cat /opt/...`）被 JS parser 当成代码。

**为什么 v1 verify 没抓到**：v1 的 [6/7] 检查是 `node -c <file>`（语法检查）。`node -c` **只校验语法**，但**不实际加载 require 链**。挂的位置在 module 顶部的字符串字面量定义那一行——**语法层面合法**（quote 配对没错），运行时才发现解析错误。

**真正的检查应该是**：实际 `require('./src/index.js')` 加载，看是否抛 SyntaxError。

### v2 修复目标

1. **Factory 代码质量改进**：
   - 禁止把多行 markdown 直接嵌入字符串字面量
   - 必须用模板字符串 `` ` ` `` + 显式 `\n`，或 `[].join('\n')`，或外读文件
2. **verify.sh 加严**：
   - 新增 [8/8]：`node -e "require('./src/index.js')"` 模块加载测试
   - 新增 [9/9]：grep 检测可疑的"多行嵌入字符串"模式
3. **Factory 自检升级**：
   - 报告里**必须**贴 `node -e "require('./src/index.js')"` 的输出，证明 module load OK

---

## §2. 改动列表

### §2.1 勘察阶段（Factory 必跑，**先做这步**）

```bash
find /opt/wonderbear/dingtalk-bot/src -type f \( -name '*.js' -o -name '*.ts' \) \
  | xargs grep -lE 'coordination/done|done.*watch|\.processed' 2>/dev/null

grep -rnE 'WO-[0-9]|workorder.*name|report\.md' /opt/wonderbear/dingtalk-bot/src 2>/dev/null | head -20
```

注：v1 已确认 watcher 主入口是 `dingtalk-bot/src/index.js`（在 `doneWatcher.start(callback)` 内）。命令路由 `command-router.js` 里有 `coordination/done` 子串但属误中（v1 处理过：第 82 行打散字符串拼接）。

**输出 Factory 必须先在报告里贴出来**，再开始改代码。

### §2.2 新增功能

在 done-watcher 检测到新报告 handler 里（`src/index.js` 的 `doneWatcher.start(...)` 回调），新增：

**伪代码**：

```javascript
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 现有 doneWatcher.start callback 内，最后追加：
function triggerAutoVerify(reportFilename) {
  // 解析 WO ID
  const m = reportFilename.match(/^(WO-[\w\.\-]+)-report\.md$/i);
  if (!m) return;
  const woId = m[1];
  const verifyPath = `/opt/wonderbear/workorders/${woId}-verify.sh`;

  if (!fs.existsSync(verifyPath)) {
    sendDingTalk(`wonderbear: 📄 ${woId} 报告就绪（无 verify.sh,跳过自动验证）`);
    return;
  }

  sendDingTalk(`wonderbear: 🔍 ${woId} 自动跑 verify.sh ...`);

  exec(
    `bash ${verifyPath}`,
    { timeout: 120000, maxBuffer: 1024 * 1024 },
    (err, stdout, stderr) => {
      const exitCode = err ? (err.code || 1) : 0;
      const tail = (stdout || stderr || '')
        .split('\n')
        .slice(-30)
        .join('\n');
      const truncated = tail.length > 1500 ? tail.slice(-1500) : tail;

      let icon, summary, nextStep;
      if (err && err.killed) {
        icon = '⏱️';
        summary = `${woId} verify 超时（>120s）`;
        nextStep = '建议: 把以上贴 Claude 判断';
      } else if (exitCode === 0) {
        icon = '✅';
        summary = `${woId} verify 全过`;
        nextStep = '下一步: 浏览器实测';
      } else {
        icon = '❌';
        summary = `${woId} verify 失败 (exit=${exitCode})`;
        nextStep = '建议: 把以上贴 Claude 判断';
      }

      // ⚠️ 关键：消息内容必须用模板字符串和显式 \n
      // 不许把多行 markdown 直接嵌入字符串字面量
      const lines = [
        `wonderbear: ${icon} ${summary}`,
        ``,
        '```',
        truncated,
        '```',
        ``,
        nextStep
      ];
      const msg = lines.join('\n');
      sendDingTalk(msg);
    }
  );
}
```

### §2.3 关键约束（Factory 必须遵守）

✅ **必须用 `child_process.exec` 异步**，不许 `execSync`
✅ **必须设 timeout: 120000**（120s）
✅ **必须设 maxBuffer: 1024 * 1024**（1MB）
✅ **必须截尾 30 行 + 1500 字符上限**
✅ **关键字 "wonderbear"**（钉钉机器人推送规则要求）
✅ **不要改现有"📄 报告就绪"逻辑**，只**新增** triggerAutoVerify 调用
✅ **如果 verify.sh 不存在**，推一条"无 verify.sh"消息提示，**不报错**

🆕 **v2 新增红线（核心修复点）**：

❌ **不许把多行 markdown 直接嵌入 JS 字符串字面量**
❌ **不许任何字符串字面量跨越超过 5 行（含转义换行）**
✅ **多行文本必须用以下方式之一**：
  - 模板字符串 `` ` ` `` + 显式 `\n`：`` `Line 1\nLine 2\nLine 3` ``
  - 数组 join：`['Line 1', 'Line 2', 'Line 3'].join('\n')`
  - 读外部文件：`fs.readFileSync('./tip.md', 'utf-8')`
✅ **任何包含反引号 \`、$ {} 等特殊字符的字符串必须严格转义**（即使在模板字符串里）

### §2.4 测试用例（Factory 自测，**v2 强制扩展**）

⚠️ **v2 新增**：完成代码改动后，Factory **必须**先跑模块加载测试，再跑功能测试。

#### Test 0（v2 强制新增）：模块加载测试

```bash
cd /opt/wonderbear/dingtalk-bot
node -e "require('./src/index.js'); setTimeout(() => process.exit(0), 100)" 2>&1 | head -20
```

**预期**：进程 100ms 后正常退出，无 SyntaxError、无 stderr 报错（除了正常的"DingTalk WebSocket 连接"日志）。

如果输出含 `SyntaxError`、`ReferenceError`、`Unexpected identifier` 等 → **代码有 bug，立即修，不许进入下一步**。

⚠️ **Factory 报告必须贴这一步的完整输出**。这是 v2 失败修复的核心。

#### Test 1：模拟 Standard 工单 verify pass

跟 v1 一样，参考 v1 报告 §4 测试 1。

#### Test 2：模拟 Standard 工单 verify fail

跟 v1 一样，参考 v1 报告 §4 测试 2。

#### Test 3：无 verify.sh

跟 v1 一样，参考 v1 报告 §4 测试 3。

**测试完清理**：
```bash
rm -f /opt/wonderbear/workorders/WO-TEST-*-verify.sh
rm -f /opt/wonderbear/coordination/done/WO-TEST-*-report.md*
rm -f /opt/wonderbear/coordination/done/WO-MINI-99-report.md*
rm -f /tmp/WO-TEST-*-verify.sh
rm -f /tmp/wo-dt-1.3-test.js
```

---

## §3. 红线（v2 增强版）

- ❌ 不许 git push
- ❌ 不许改 server-v7（这是 dingtalk-bot 工单）
- ❌ 不许 mock 兜底
- ❌ 不许 `&&` 命令链（在改的代码里）
- ❌ 不许 ssh heredoc 嵌套引号
- ❌ 不许 "Always allow" 任何权限提示
- ❌ **不许用 execSync** —— 阻塞主线程会触发钉钉重投
- ❌ **不许动现有"📄 报告就绪"推送逻辑** —— 只新增 verify 触发
- ❌ 不许动现有 .processed 后缀逻辑
- ❌ 不许写 `console.log('[debug]')` 调试日志进 mainline，要用现有 logger
- ❌ pm2 restart wonderbear-dingtalk 由 **Kristy 手动**做，Factory 报告里写"待 Kristy restart"

🆕 **v2 新增红线**：
- ❌ **不许把多行 markdown / 多行字符串字面量直接嵌入 JS 代码** —— 必须用模板字符串 + \n、数组 join、或外读文件
- ❌ **任何字符串字面量跨越 > 5 行 = 红线违规**
- ❌ **完工自检不跑 `node -e "require('./src/index.js')"` = 不许提交报告**

**改动总行数硬上限**: 80 行。超 80 行立刻停下报告。

---

## §4. 备份纪律

⚠️ **v2 复用 v1 已有的 backup 文件**（v1 回滚后 backup 文件还在）：
- `/opt/wonderbear/dingtalk-bot/src/index.js.backup-2026-04-30-wo-dt-1.3-pre`
- `/opt/wonderbear/dingtalk-bot/src/command-router.js.backup-2026-04-30-wo-dt-1.3-pre`

**Factory 不需要重新创建 backup**——这两个文件代表"WO-DT-1.3 改动前的 clean 基线"，是 v2 回滚的合法锚点。

如果 Factory 担心 backup 被覆盖（操作意外），可以**额外**创建 v2 自己的 backup：

```bash
ssh wonderbear-vps "
cd /opt/wonderbear/dingtalk-bot
# 不动 wo-dt-1.3-pre,只在 v2 改动前另存一份
cp src/index.js src/index.js.backup-2026-04-30-wo-dt-1.3-v2-pre
cp src/command-router.js src/command-router.js.backup-2026-04-30-wo-dt-1.3-v2-pre
"
```

---

## §5. Dry-run 校验

```bash
cd /opt/wonderbear/dingtalk-bot
node -c src/index.js && node -c src/command-router.js
echo "--- module load test ---"
node -e "require('./src/index.js'); setTimeout(() => process.exit(0), 100)" 2>&1 | head -20
```

预期：`node -c` 通过 + `require()` 加载无 SyntaxError。

---

## §9. 验收

### §9.1 自动验证（verify.sh 跑）

详见 `WO-DT-1.3-verify.sh`。post 模式 9 项检查（v1 是 7 项，v2 加 2 项）：
1. backup 文件存在
2. watcher 文件出现关键代码（child_process.exec / verify.sh / 120000）
3. 没有 execSync 出现
4. 没有 console.log 调试污染
5. 没有 mock 关键字
6. dingtalk-bot 编译通过（`node -c`）
7. Factory 报告里包含 3 个测试用例的输出
8. 🆕 **`node -e "require()" 模块加载测试通过**（v2 核心）
9. 🆕 **没有"多行 markdown 嵌入字符串"嫌疑模式**

### §9.2 人工 restart（Kristy 跑，Factory 不许动）

verify 通过后 Kristy 跑：
```bash
ssh wonderbear-vps "pm2 restart wonderbear-dingtalk && pm2 logs wonderbear-dingtalk --lines 20 --nostream"
```

预期：restart 成功 + 日志显示 `[READY] DingTalk Stream connected`，无 SyntaxError / ReferenceError。

### §9.3 真实工单触发测试（Kristy 验收）

Kristy 派下一个 Standard 工单时，**不再 ssh 跑 verify**，**只看钉钉**：
- 收到 🔍 → ✅/❌ 两条消息 → WO-DT-1.3 v2 真实生效

---

## §10. 回滚

### 10.1 改坏了 / Factory 跑歪

```bash
ssh wonderbear-vps "
cd /opt/wonderbear/dingtalk-bot
cp src/index.js.backup-2026-04-30-wo-dt-1.3-pre src/index.js
cp src/command-router.js.backup-2026-04-30-wo-dt-1.3-pre src/command-router.js
pm2 restart wonderbear-dingtalk
"
```

### 10.2 已 commit 但想撤销

v2 不应该 commit 失败的代码。如果 v2 verify 全过 + restart 正常 + 钉钉真实测试通过 → commit。否则继续修。

---

## 派单 SOP

### 1. 上传 + 配置

```bash
scp /c/Users/Administrator/Downloads/WO-DT-1.3.md \
    /c/Users/Administrator/Downloads/WO-DT-1.3-verify.sh \
    /c/Users/Administrator/Downloads/WO-DT-1.3-collect.sh \
    wonderbear-vps:/opt/wonderbear/workorders/

ssh wonderbear-vps "
sed -i 's/\r\$//' /opt/wonderbear/workorders/WO-DT-1.3*.sh
chmod +x /opt/wonderbear/workorders/WO-DT-1.3*.sh
mkdir -p /opt/wonderbear/coordination/workorders/WO-DT-1.3
cp /opt/wonderbear/workorders/WO-DT-1.3.md /opt/wonderbear/coordination/workorders/WO-DT-1.3/README.md
ls -la /opt/wonderbear/workorders/WO-DT-1.3*
"
```

⚠️ 这次**同名覆盖**，旧的 v1 文件会被替换。这是 SPEC v2 §B 类失败处理的标准做法。

### 2. 派 Factory

钉钉发：
```
派 WO-DT-1.3
```

⚠️ **派单前先归档 v1 的 done 报告**（避免钉钉机器人误以为已完成）：
```bash
ssh wonderbear-vps "mv /opt/wonderbear/coordination/done/WO-DT-1.3-report.md /opt/wonderbear/coordination/done/WO-DT-1.3-report.md.v1-failed"
```

### 3. Factory 完工 → 手动 collect+verify（v1 还没生效，所以这次还得手动一次）

```bash
ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-DT-1.3-collect.sh && echo '=== VERIFY ===' && bash /opt/wonderbear/workorders/WO-DT-1.3-verify.sh"
```

### 4. verify 通过 → Kristy restart + 真实测试

```bash
ssh wonderbear-vps "pm2 restart wonderbear-dingtalk"
sleep 3
ssh wonderbear-vps "pm2 logs wonderbear-dingtalk --lines 20 --nostream"
```

⚠️ **看完日志确认 `[READY] DingTalk Stream connected` 才算上线**。

---

## §11. commit message 模板

```
feat(dingtalk-bot): WO-DT-1.3 (v2) done-watcher 自动跑 verify + 推钉钉

修复 v1 失败：v1 把多行 markdown 嵌入 JS 字符串字面量导致 SyntaxError,
pm2 restart 时 dingtalk-bot 启动崩溃。v2 修复：
- 多行钉钉消息改用模板字符串 + 显式 \\n 或数组 join
- verify.sh 加 module-load 测试 (node -e "require()") 在语法检查之外
  额外捕获运行时 parse 错误
- Factory 自检强制贴 require() 加载测试输出

实现要点（v1 保留）：
- child_process.exec 异步（不许 execSync 阻塞主线程触发钉钉重投）
- 120s 超时 + 1MB 输出上限 + 1500 字符截尾
- 不动现有"📄 报告就绪"推送逻辑,只新增 verify 触发
- 无 verify.sh 时（Mini 工单）推"无 verify"消息维持兼容

测试：4 个用例（module-load + pass / fail / no-verify）全跑通；
pm2 重启 OK + DingTalk Stream connected。明天起所有 Standard 工单
完工自动验证。

Refs: coordination/workorders/WO-DT-1.3/README.md
```

---

完。
