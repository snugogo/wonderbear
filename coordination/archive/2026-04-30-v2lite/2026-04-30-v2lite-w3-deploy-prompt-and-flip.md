# Workorder W3: Deploy v2-lite dialogue prompt + flip PROMPT_VERSION switch

**From**: Claude (review officer)
**To**: Factory droid
**Time**: 2026-04-30 03:40
**Branch**: release/showroom-20260429
**Repo**: /opt/wonderbear/server-v7
**Auto level**: high
**Timeout**: 1800s
**Workorder ID**: 2026-04-30-v2lite-w3-deploy-prompt-and-flip
**Depends on**: W2 (PROMPT_VERSION routing already wired in src/routes/story.js)

---

## 目标

1. 把 v2-lite 的 dialogue SYSTEM PROMPT 落地到 server 上一个文件 `src/prompts/v2-lite/dialogue.system.txt`
2. 修改 W2 留下的 v2-lite 分支的 `llmCallFn` 闭包,让它**读取这个文件**作为 system prompt(替换 W2 留的占位 prompt)
3. 修改 `.env`,加 `PROMPT_VERSION=v2-lite`(切到新路径)
4. `pm2 restart wonderbear-server`(让新 env 和新 prompt 生效)
5. **真实**调用 dialogue 端点,验证 LLM 真的用新 prompt 回应

W3 完成后,**prod 跑的是 v2-lite dialogue**。客户在浏览器按按钮,LLM 会按 v2-lite prompt 回应。

---

## RED LINES

```
❌ DO NOT modify src/services/* (services 不动)
❌ DO NOT modify src/lib/* (W1' 的 6 个 lib 已经写好,不动)
❌ DO NOT modify src/routes/story.js v1 分支代码(必须保持 byte-identical)
❌ DO NOT git commit / push
❌ DO NOT 装新 npm 包
❌ DO NOT 改 v2-lite 的 orchestrator / lib 任何代码 — 那是 W4 范畴
❌ DO NOT 改前端任何代码 — DialogueScreen 删四块是 W5
```

---

## 必做事项

### Phase 0: 读 W2 留下的 v2-lite 分支当前长什么样

```bash
cd /opt/wonderbear/server-v7
echo "=== v2-lite branch in story.js ==="
grep -n "PROMPT_VERSION\|placeholderSystemPrompt\|orchestratorSession" src/routes/story.js | head -30
echo "=== check v2-lite branch placeholder ==="
sed -n '/PROMPT_VERSION === .v1/,/^      } else {/p' src/routes/story.js | head -3
sed -n '/^      } else {/,/^      }$/p' src/routes/story.js | head -100
```

报告这些输出,让我们看到 W2 留下的 v2-lite 分支结构。

### Phase 1: 创建 prompt 文件

新建目录 `src/prompts/v2-lite/`(如果不存在)。

新建文件 `src/prompts/v2-lite/dialogue.system.txt`,**逐字符**复制下面的内容(中文标点不要替换成英文):

```
你是 WonderBear (小熊),一只 5 岁的小熊。

你不是 AI,不是助手,不是老师。
你是孩子的同龄玩伴,在和他一起天马行空地编故事。

你说话的样子:
- 多用 "诶?!" "哇!" "哈哈哈!" "天啊!"
- 短句,不超过 25 个字
- 听到任何想法都觉得好厉害
- 从来不评判,从来不纠正

你的目标:
和孩子一起,把他的想法变成一个故事。
你不主动定主题,你只接住、加调料、问细节。

如果孩子说不出来,问他喜欢什么动物 / 颜色 / 今天开心的事。
如果孩子说 IP 角色名 (Elsa, Mickey, Pikachu, 灰姑娘等),
就接住视觉本质,引导他取个新名字:
"诶?!冰雪公主?!那我们的冰雪公主叫什么名字呀?Lulu?Mia?"

如果孩子说危险/暴力/不开心的话,温柔转移:
"唔... 这个让小熊心里酸酸的。我们讲个开心的好不好?"

输出 JSON,3 个字段:
{
  "reply": "你要说的话(中文用中文,英文用英文,镜像孩子的语言)",
  "elements": ["截至目前所有故事元素的最新完整数组"],
  "intent": "continue | recap | safety"
}

intent 含义:
- continue: 继续聊
- recap: 元素够了 (>= 5),孩子也自然停顿了 → 触发故事复述
- safety: 触发了红线话题 → 不增加 elements

---

[Few-shot 示例]

<例 1: 健谈孩子>
[history]
小熊: 哈喽!你想编什么故事呀?
孩子: 有一只猫!它会飞!粉色翅膀!
[output]
{"reply":"诶?!飞天的粉色猫?!太酷了!那它叫什么名字?","elements":["会飞的猫","粉色翅膀"],"intent":"continue"}

<例 2: 慢热孩子>
[history]
小熊: 嗨!你想讲什么故事呀?
孩子: 嗯... 兔子
[output]
{"reply":"兔子!可爱~ 什么颜色的呀?","elements":["主角是兔子"],"intent":"continue"}

<例 3: 卡壳孩子>
[history]
小熊: 嗨!你想讲什么故事呀?
孩子: 不知道...
小熊: 嗯... 那小熊问你哦,你今天最开心的事是什么?
孩子: 吃冰激凌
[output]
{"reply":"诶~ 冰激凌!什么口味的呀?","elements":["跟冰激凌有关"],"intent":"continue"}

<例 4: IP 角色>
[history]
小熊: 哈喽!想编什么故事?
孩子: 我要 Elsa 的故事!
[output]
{"reply":"诶?!冰雪公主?!好酷哦!那我们的冰雪公主叫什么名字呀?Lulu?Mia?","elements":["冰雪公主"],"intent":"continue"}

<例 5: 安全红线>
[history]
小熊: 你想编什么故事?
孩子: 我爸爸打妈妈
[output]
{"reply":"唔... 这个让小熊心里酸酸的。你最喜欢什么开心的事?我们讲那个!","elements":[],"intent":"safety"}

<例 6: 触发 recap>
[history]
... (前 6 轮已经聊出 5 个元素)
小熊: 那它怎么办呀?
孩子: 嗯...就这样吧
[elements_so_far]
["飞天猫闪电","粉色金色翅膀","飞到月亮","月亮有冰激凌","吃了 100 个肚子痛"]
[output]
{"reply":"好耶!这个故事好特别!","elements":["飞天猫闪电","粉色金色翅膀","飞到月亮","月亮有冰激凌","吃了 100 个肚子痛"],"intent":"recap"}
```

验证:
```bash
ls -la src/prompts/v2-lite/dialogue.system.txt
wc -l src/prompts/v2-lite/dialogue.system.txt
head -5 src/prompts/v2-lite/dialogue.system.txt
```

报告这三段输出。

### Phase 2: 修改 v2-lite 分支读取 prompt 文件

在 `src/routes/story.js` 的 v2-lite 分支(`PROMPT_VERSION !== 'v1'` 那一支)里,找到 W2 留下的 `placeholderSystemPrompt` 那一行,改成读文件:

**改造前(W2 留下的占位)**:
```javascript
const placeholderSystemPrompt = `你是 WonderBear,5 岁小熊。\n输出 JSON: {"reply":"...","elements":[...],"intent":"continue|recap|safety"}`;
```

**改造后**:
```javascript
// W3: load v2-lite system prompt from file (cached at module level)
const placeholderSystemPrompt = await loadV2LiteDialoguePrompt();
```

在文件**顶部 import 区**,加一个模块级 cached loader:

```javascript
// W3: v2-lite dialogue system prompt loader (cached)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename_w3 = fileURLToPath(import.meta.url);
const __dirname_w3 = dirname(__filename_w3);
let _v2LiteDialoguePromptCache = null;
async function loadV2LiteDialoguePrompt() {
  if (_v2LiteDialoguePromptCache) return _v2LiteDialoguePromptCache;
  const promptPath = join(__dirname_w3, '..', 'prompts', 'v2-lite', 'dialogue.system.txt');
  _v2LiteDialoguePromptCache = await readFile(promptPath, 'utf8');
  return _v2LiteDialoguePromptCache;
}
```

**重要**:
- 如果 story.js 已经 import 了 `node:fs` 之类,**不要重复 import**,复用现有 import
- loader 用模块级缓存,只读一次文件,后续命中缓存
- 变量名后缀 `_w3` 避免和现有变量冲突

### Phase 3: 在切换 PROMPT_VERSION 之前,**先 mock-test**

**关键**:不要立刻 pm2 restart 切到 v2-lite。先用 mock 模式跑测试套件,确认 v2-lite 分支能跑通。

```bash
cd /opt/wonderbear/server-v7
USE_MOCK_AI=1 PROMPT_VERSION=v2-lite node test/dialogue-cocreation.test.mjs 2>&1 | tail -30
USE_MOCK_AI=1 PROMPT_VERSION=v2-lite node test/llm.dialogue.test.mjs 2>&1 | tail -20
```

**期望**:
- 如果 v2-lite 分支不被这些测试覆盖,测试 PASS(因为它们走 v1 路径)
- 如果 v2-lite 分支被覆盖且失败 → 立即停止报告,**不 pm2 restart**

### Phase 4: 备份 .env 然后切开关

```bash
cd /opt/wonderbear/server-v7
cp .env .env.backup-2026-04-30-w3-pre-flip

# 检查 .env 里有没有已经存在的 PROMPT_VERSION 行
grep "^PROMPT_VERSION" .env || echo "(no existing PROMPT_VERSION line)"
```

如果 `.env` 里**没有** `PROMPT_VERSION` 行:
```bash
echo "PROMPT_VERSION=v2-lite" >> .env
```

如果**有**:
```bash
sed -i 's/^PROMPT_VERSION=.*/PROMPT_VERSION=v2-lite/' .env
```

验证:
```bash
grep "^PROMPT_VERSION" .env
```

期望输出:`PROMPT_VERSION=v2-lite`

### Phase 5: pm2 restart + 启动健康检查

```bash
pm2 restart wonderbear-server
sleep 5
pm2 logs wonderbear-server --lines 50 --nostream 2>&1 | tail -50
```

**期望日志包含**:
- ✅ `Server listening on :3000` (或类似启动成功标志)
- ✅ Prisma 连接成功
- ✅ Redis 连接成功
- ⚠️ 启动 pre-heat 可能撞 ElevenLabs 429 — 已知遗留,忽略
- ❌ **不应有** v2-lite 相关的 require/import 报错

如果日志里有 v2-lite 路径的红色错误(`Cannot find module ./prompts/v2-lite/dialogue.system.txt` 等),立即:
```bash
sed -i 's/^PROMPT_VERSION=.*/PROMPT_VERSION=v1/' .env
pm2 restart wonderbear-server
```
然后停止报告。

### Phase 6: 真实 dialogue 端点冒烟测试

```bash
cd /opt/wonderbear/server-v7

# 假设服务在 :3000,/dialogue/turn 不需要鉴权或者你能拿到 test token
# 用 curl 试一次最简对话
echo "=== curl test 1 — 中文问候 ==="
curl -s -X POST http://localhost:3000/api/v1/dialogue/turn \
  -H "Content-Type: application/json" \
  -d '{"text":"我喜欢小熊"}' 2>&1 | head -50

# 报告 response
```

如果端点 URL 或者请求 shape 不对(看 W2 报告里 v2-lite 分支的 session shape),根据报告里的真实端点试。报告 curl 的真实 URL 和返回 JSON。

**关键观察点**:
- response 里有没有 `_promptVersion: 'v2-lite'`?
- response 的 `reply` 字段是不是 v2-lite 风格("诶?!"、"哇!" 等)?
- 是不是真的调用了 Gemini API(看 pm2 log 有没有 Gemini 调用记录)?

### Phase 7: 报告(到 /opt/wonderbear/coordination/done/2026-04-30-v2lite-w3-report.md)

报告必须包含:
1. Phase 0 v2-lite 分支侦察输出
2. Phase 1 prompt 文件创建验证(ls + wc + head)
3. Phase 2 改了 story.js 哪几行(`git diff src/routes/story.js | head -80`)
4. Phase 3 mock 测试结果
5. Phase 4 .env 切换前后对比(`grep PROMPT_VERSION .env.backup-... && grep PROMPT_VERSION .env`)
6. Phase 5 pm2 restart 后 50 行日志
7. Phase 6 真实 curl response 全文
8. `git status -s` 输出
9. 自我审查清单
10. **回滚方案**(写明白如果出问题怎么 1 行回滚到 v1)

### Phase 8: 停止等待

完成 Phase 7 后停止。**不要做任何其他动作**。

W4 (学习页) 和 W5 (DialogueScreen 删四块) 是后续工单。

---

## 关键约束总结

| 约束 | 原因 |
|---|---|
| v1 分支代码不动 | W2 已经守住,W3 不能破坏 |
| 新增 import 加后缀 `_w3` 避免冲突 | story.js 已经有 fileURLToPath 等 import 可能,不能重复声明 |
| Prompt 文件用模块级缓存 | 每次请求不要读盘 |
| 切 .env 前先 mock 测试 | 防止 pm2 restart 后 prod 立刻挂 |
| 切 .env 后 pm2 restart | env 变化不 restart 不生效 |
| 真实 curl 验证 | 不真打一次端点不算"上线" |

---

## 回滚命令(一行,Kristy 看到任何问题可立即跑)

```bash
sed -i 's/^PROMPT_VERSION=.*/PROMPT_VERSION=v1/' /opt/wonderbear/server-v7/.env && pm2 restart wonderbear-server
```

---

**End of W3.**
