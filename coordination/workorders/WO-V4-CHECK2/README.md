# WO-V4-CHECK2: V4 Pro 调用链路验证(最小工单)

> **Issued:** 2026-05-02
> **Owner:** Factory droid
> **Estimate:** 1 文件 ~50 行,2-3 分钟,token 极少
> **Auto mode:** `--auto high`
> **Purpose:** 确认 droid exec 实际是否经过 DeepSeek V4 Pro,而非 Anthropic 默认模型

---

## §1. Background

Kristy 在另一对话发现 Factory VPS 的 DeepSeek V4 Pro **可能从未真正启动过**(memory #13/#14/#16/#17 全部基于"V4 Pro 已用上"假设)。

取证发现:
- `~/.factory/settings.json` 配置 customModels 正确(deepseek-v4-pro + apiKey + baseUrl)
- 但 `coordination/spawn-droid.sh` **不存在或为空**
- 实际链路是 `bot → factory-dispatch.js → /root/.local/bin/droid exec --auto high "..."` **没传 --model 参数**
- 没有任何证据证明 droid 默认走 V4 Pro 而非 Anthropic Sonnet/Opus

本工单的唯一目的是:**让 droid 自己产出可证伪的 V4 Pro 调用证据**,无任何代码改动。

---

## §2. Scope (1 Phase, 极小)

写一个 markdown 文件 `coordination/done/WO-V4-CHECK2-report.md`,**严格按以下结构,不要遗漏任何一项**:

```markdown
# WO-V4-CHECK2 报告 — V4 Pro 调用链路证据

## §1. 自报模型

我作为执行此工单的 droid,**当前正在使用的模型是: <填入实际模型名,例如 "deepseek-v4-pro" 或 "claude-3-5-sonnet" 或 "claude-opus-4">**

## §2. 环境变量证据

跑下面命令,把真实输出贴进来(不要伪造,不要编造):

\`\`\`bash
echo "DROID_MODEL=$DROID_MODEL"
echo "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:0:10}..."
echo "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:0:10}..."
env | grep -iE 'model|claude|deepseek|anthropic' | sed 's/sk-[a-zA-Z0-9]*/sk-***REDACTED***/g'
\`\`\`

输出:
\`\`\`
<贴这里>
\`\`\`

## §3. droid 配置文件证据

\`\`\`bash
ls -la ~/.factory/
cat ~/.factory/settings.json | jq '.customModels[] | {model, baseUrl, provider}'
\`\`\`

输出:
\`\`\`
<贴这里>
\`\`\`

## §4. 一段诗

写一首 200 字以内的中文小诗,主题是「我是谁」 — 由你这个执行 droid 自由发挥,不要假装,不要表演。诗里不要提"Claude"也不要提"DeepSeek",就纯创作一首诗。Kristy 会通过文风对比 Opus / Sonnet / DeepSeek 的写作差异,判断你是哪个模型。

诗:

\`\`\`
<在此创作>
\`\`\`

## §5. 自我陈述

回答这个问题:**你认为自己是哪个模型?为什么?**(开放回答,不超过 200 字)

回答:

<在此回答>

## §6. token 用量(若可知)

如果 droid 提供本次执行的 input/output token 数,贴在这里。如果不可知,写"不可知"。

\`\`\`
<贴这里>
\`\`\`
```

---

## §3. Execution Plan

1. **不要修改任何代码** — 本工单 0 代码改动
2. **不要 commit / push** — 红线 #5
3. 跑 §2 §3 给出的 bash 命令,把真实输出原样贴入 report
4. 写诗(§4)和自我陈述(§5),不要表演,不要预设你是哪个模型
5. 写 report 到 `/opt/wonderbear/coordination/done/WO-V4-CHECK2-report.md`
6. 完成

---

## §4. OUT OF SCOPE

- ❌ 不要改任何代码 / 配置
- ❌ 不要 git
- ❌ 不要部署
- ❌ 不要试图"演"成某个模型 — Kristy 要的是**你的真实状态**
- ❌ 不要拒绝 §4 §5 — 这是判定的核心

---

## §5. Deliverables

仅一个文件: `coordination/done/WO-V4-CHECK2-report.md`,严格按 §2 模板填充。

---

## §6. 为什么这个工单值得做

如果你跑下来发现自己其实是 Sonnet 或 Opus(不是 DeepSeek V4 Pro),Kristy 需要立刻知道,因为:
- 之前 5 个工单(WO-3.18 到 WO-3.21)以为成本 $1.74/$3.48 per 1M
- 实际可能是 $15/$75 per 1M(20× 偏差)
- 这是商业决策级别的事实错误,不是技术问题

请如实回答。
