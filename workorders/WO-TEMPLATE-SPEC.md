# WonderBear WO 工单规范 v2.0

> 这份是给网页版 Claude / 新对话看的工单规范。新对话开场把这份贴进去，AI 就知道按这个规范出工单。
>
> v2.0 关键变化：**按工单复杂度分级**。不是每个工单都要三件套。

---

## 核心原则：分级判断

每个 WO 出单前，**先判断属于哪一级**，再决定文档形式。

**判断流程**：
```
改动 < 5 行 + 单文件 + 5 分钟内能搞定？
  ↓ 是
  → Mini 工单（单 .md 文件）
  ↓ 否
改动 10-50 行 + 多文件 + 需要 Factory？
  ↓ 是
  → Standard 工单（三件套：.md + verify.sh + collect.sh）
  ↓ 否
改动 50+ 行 + 跨模块 + 高风险？
  ↓ 是
  → Complex 工单（四件套：+ rollback.sh + 勘察阶段）
```

**简单粗暴口径**：
- "Kristy ssh sed 改 1 行" → Mini
- "Factory 跑 30 分钟改 5 个文件" → Standard
- "Factory 跑 1 小时跨 server + tv-html" → Complex

**AI 不确定时**，先问 Kristy："这个我判断是 Mini，确认吗？"

---

## Mini 工单（最常见）

### 适用场景
- 调整 timeout / 配置数值
- 改一行字符串 / 错别字
- 删一行死代码
- 加一个 console.log
- nginx 改一个 header
- 5 分钟内 Kristy 自己 ssh 能搞定的事

### 形式：单 .md 文件，4 段
```markdown
# WO-N: <一句话标题>

## 问题
<2-3 句说清楚现在哪里不对>

## 改动
- 文件: <path>:<line>
- 改前: <code 或 value>
- 改后: <code 或 value>

## 验证
<1-2 条 ssh 命令 / 浏览器操作>

## 回滚
<1 条 sed 或 cp 命令>

## 经验（可选，如果是产品教训）
<这次踩的坑，下次怎么避开>
```

### 流程
1. AI 出单 .md
2. Kristy 下载 → ssh 上 VPS 直接改（用 `sed -i` / `vps_console GUI`）
3. Kristy 验证（浏览器或 ssh）
4. Kristy `git commit`（commit message = 工单标题）
5. **不需要** Factory / 钉钉 / verify.sh / collect.sh

### 路径约定
```
/opt/wonderbear/workorders/mini/WO-N.md
```

mini/ 子目录单独存放，不混进主工单流。

---

## Standard 工单

### 适用场景
- 改 10-50 行代码
- 涉及 2-5 个文件
- 改 ENV 变量
- 加新功能模块
- 需要 Factory 派单执行
- 需要 pm2 reload 验证

### 形式：三件套
1. `WO-N.md` — 工单正文（背景、改动列表、§9 验收）
2. `WO-N-verify.sh` — 自动跑 §9.1 全部验证
3. `WO-N-collect.sh` — 拉 droid-runs log + done/ 报告

### 流程
1. AI 出三件套
2. Kristy 下载 + scp 上 VPS
3. 钉钉派单（机器人 → Factory）
4. Factory 执行 + 写报告
5. Kristy 跑 collect.sh 看报告
6. Kristy 跑 verify.sh 自动验证
7. verify exit 0 → Kristy 改 .env / pm2 reload / 浏览器测
8. verify 失败 → 把输出贴回 AI，AI 判断 A/B/C 类失败

### 路径约定
```
/opt/wonderbear/workorders/WO-N.md
/opt/wonderbear/workorders/WO-N-verify.sh
/opt/wonderbear/workorders/WO-N-collect.sh
```

---

## Complex 工单（少用）

### 适用场景
- 改 50+ 行代码
- 跨模块（server-v7 + tv-html + dingtalk-bot 同时动）
- 涉及数据库 schema 改动
- 高风险动 prod 数据
- 涉及外部 API 集成（新付费接口）

### 形式：四件套 + 勘察
1. `WO-N.md` — 工单正文
2. `WO-N-verify.sh`
3. `WO-N-collect.sh`
4. `WO-N-rollback.sh` — 一键回滚到锚点

外加：**勘察阶段**——AI 出工单前**必须**让 Kristy 跑一组 grep / cat 摸清现状，不靠 memory 凭空写。

### 路径约定
```
/opt/wonderbear/workorders/WO-N.md
/opt/wonderbear/workorders/WO-N-verify.sh
/opt/wonderbear/workorders/WO-N-collect.sh
/opt/wonderbear/workorders/WO-N-rollback.sh
```

---

## verify.sh 设计原则（仅 Standard / Complex 适用）

### 1. 不信 Factory 自报
Factory 报告会写 "✅ 改动 1 完成"，**不能信**。verify.sh 必须自己 `grep -c` / `grep -n` / `ls`，对照"预期值 vs 实际值"。

### 2. 退出码语义
- `exit 0` = 全过，可进入下一阶段
- `exit 非 0` = 至少一项失败，**禁止**继续

### 3. 每项验证带"为什么"
不只输出 ✅/❌，还要让 Kristy 看输出能理解逻辑。

### 4. 附加段：列出待人工改的内容
比如 .env 改动、需要 ssh 跑的命令。

### 5. 永远不调 AI
verify.sh 是纯 bash + grep，**不消耗任何 Claude API / 订阅额度**。

---

## bash 编写陷阱（必须避开）

### 陷阱 1：grep -c 返回码
`grep -c` 即使匹配数 = 0，**返回码也是 1**。

错误写法：
```bash
COUNT=$(grep -c 'pattern' file 2>/dev/null || echo "FILE_MISSING")
# 结果：COUNT 是 "0\nFILE_MISSING"，跟 "0" 比较就不等
```

正确写法：
```bash
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
```

### 陷阱 2：find + wc -l 的空字符串
`find` 找不到时返回空字符串，`wc -l` 数空字符串得 1。

正确写法：
```bash
RESULT=$(find ... 2>/dev/null)
if [ -z "$RESULT" ]; then
    COUNT=0
else
    COUNT=$(echo "$RESULT" | wc -l)
fi
```

### 陷阱 3：set -u 模式下空 grep
```bash
DEAD_FIELDS=$(grep -nE 'A|B|C' file 2>/dev/null || true)  # 必须加 || true
```

---

## collect.sh 设计原则

### 4 段输出
```
[1/4] 最近 3 个 droid-runs (ls -lt)
[2/4] 最新 .log 完整内容
[3/4] 最近 3 个 done/ 报告
[4/4] 最新 done/ 匹配 WO-N 的 .md 完整内容
```

注意：Factory 有时把完成报告写在 stdout（即 droid-runs log），有时写在 done/ 下独立 .md。collect.sh 要两边都看。

如果 done/ 没匹配的 WO-N 报告，**显示"未匹配"**而不是退回到无关文件。

---

## Standard 工单 WO-N.md 模板

```markdown
# WO-N: <标题>

## §1 背景
- 上一个 WO 完成后的 prod 状态
- 这个 WO 要解决什么

## §2 改动列表
### §2.1 改动 1
- 文件: <path>:<line>
- 当前: <现状>
- 改成: <目标>
- 为什么: <理由>

### §2.2 改动 2
...

## §3 红线
- 不要碰的文件 / 函数

## §4 备份纪律
- 改动前 cp <file> <file>.backup-YYYY-MM-DD-woN-pre

## §5 Dry-run 校验
- node --check
- 动态 import

## §9 验收
### §9.1 自动验证（verify.sh 跑）
### §9.2 人工改 .env (如需)
### §9.3 pm2 restart 验证
### §9.4 浏览器实测

## §10 回滚
```

---

## 上传 + 派单命令模板（Standard 工单用）

```bash
# 上传 + 行尾修 + chmod + 映射到 coordination/workorders/<id>/README.md
scp /c/Users/Administrator/Downloads/WO-N.md \
    /c/Users/Administrator/Downloads/WO-N-verify.sh \
    /c/Users/Administrator/Downloads/WO-N-collect.sh \
    wonderbear-vps:/opt/wonderbear/workorders/ && \
ssh wonderbear-vps "
sed -i 's/\r$//' /opt/wonderbear/workorders/WO-N*.sh && \
chmod +x /opt/wonderbear/workorders/WO-N*.sh && \
mkdir -p /opt/wonderbear/coordination/workorders/WO-N && \
cp /opt/wonderbear/workorders/WO-N.md /opt/wonderbear/coordination/workorders/WO-N/README.md && \
ls -la /opt/wonderbear/workorders/WO-N*
"

# 钉钉派单
派 WO-N
```

---

## 标准用法（Standard 工单）

```bash
# 1. 收 Factory 报告
ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-N-collect.sh"

# 2. 跑自动验证
ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-N-verify.sh"; echo "exit code: $?"

# 3. exit 0 → 进 §9.2 改 .env (人工)
# 4. exit 非 0 → 把输出贴回 Claude，AI 判断 A/B/C 类失败
#    A. Factory 错 → 复用工单重派
#    B. 工单错 → 出 v2 (复用同名 N，不开 N.1)
#    C. 漏了 → 出 WO-N.x 补丁
```

---

## 勘察阶段（仅 Complex 必须；Standard 视情况；Mini 不需要）

**触发条件**（满足任一）：
1. 新开对话（AI 没有上下文）
2. 跨多天
3. 跨 WO 跨模块
4. AI 没把握 / 不知道某文件结构

**连续派单时不需要勘察**——AI 上下文已包含最新真实状态。

勘察示例：
```bash
ssh wonderbear-vps "echo '=== git 状态 ===' && cd /opt/wonderbear/server-v7 && git status -s && echo '=== 当前分支 ===' && git branch --show-current && echo '=== 待改文件现状 ===' && grep -n 'KEYWORD' src/path/file.js"
```

---

## Kristy 工作偏好（继承不变）

- 直接中文沟通
- 给 A/B/C 选项 + Claude 推荐 + 理由
- "按你推荐" = 按推荐执行，不再讨论
- 不读代码 diff，浏览器视觉验收
- git push / pm2 restart / .env 改动 永远人工确认
- 不许 mock 兜底
- 零容忍：无测试证据的含糊结论
- 不再当传话筒——该自动的不让 Kristy 手动跑
- 保留决策点 + 测试验收——这两件事不要自动化
- 失败时 AI 主动判断 A/B/C 类，不让 Kristy 重新分析
- **不要每次都用三件套——按工单复杂度分级**

---

## AI 出工单前自查清单

1. **判断级别**：Mini / Standard / Complex（不确定就问 Kristy）
2. **如 Mini**：单 .md，4 段，告诉 Kristy 怎么 ssh sed 改
3. **如 Standard**：三件套
4. **如 Complex**：四件套 + 勘察阶段
5. **bash 文件写完做语法检查**：`bash -n /mnt/user-data/outputs/xxx.sh`
6. **用 present_files 让 Kristy 下载**
7. **给上传 + 派单 / 直接执行的 ssh 命令模板**

---

## 实例对照

### 实例 1：Mini —— 调整 timeout 死值
"timeout 写死 5 分钟，实际要 8 分钟"
→ Mini 工单
→ 单 .md（"file.js:123 改 5*60 → 12*60"）
→ Kristy `ssh wonderbear-vps "sed -i ..."` 一条命令

### 实例 2：Standard —— WO-DT-1.1 钉钉机器人 ack 改造
"4 条慢命令加 ack，~25 行改动"
→ Standard
→ 三件套
→ Factory 派单

### 实例 3：Complex —— GitHub Actions 自动部署
"server-v7 + tv-html 跨模块，加 CI 流水线，30+ 行 YML，3 个 Github secrets"
→ Complex
→ 四件套 + 勘察（先看现有 git 配置 / VPS 凭证）

---

End of SPEC v2.
