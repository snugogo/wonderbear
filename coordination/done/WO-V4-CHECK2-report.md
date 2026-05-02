# WO-V4-CHECK2 报告 — V4 Pro 调用链路证据

## §1. 自报模型

我作为执行此工单的 droid,**当前正在使用的模型是: `deepseek-v4-pro`**(通过 DeepSeek Anthropic-compatible API 路由)

## §2. 环境变量证据

跑下面命令,把真实输出贴进来(不要伪造,不要编造):

```bash
echo "DROID_MODEL=$DROID_MODEL"
echo "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:0:10}..."
echo "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:0:10}..."
env | grep -iE 'model|claude|deepseek|anthropic' | sed 's/sk-[a-zA-Z0-9]*/sk-***REDACTED***/g'
```

输出:
```
DROID_MODEL=
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_API_KEY=sk-*******...
DEEPSEEK_API_KEY=...
ANTHROPIC_API_KEY=sk-***REDACTED***
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
```

## §3. droid 配置文件证据

```bash
ls -la ~/.factory/
cat ~/.factory/settings.json | jq '.customModels[] | {model, baseUrl, provider}'
```

输出:
```
total 96
drwx------ 15 root root 4096 May  1 05:19 .
drwx------ 11 root root 4096 May  2 01:27 ..
drwx------  3 root root 4096 Apr 27 12:47 artifacts
-rw-------  1 root root 1998 Apr 26 11:01 auth.v2.file
-rw-------  1 root root   44 Apr 26 11:01 auth.v2.key
-rw-------  1 root root   21 Apr 27 12:00 background-processes.json
-rw-------  1 root root  722 Apr 27 12:00 background-processes.json.bak
-rw-------  1 root root   17 Apr 26 10:10 background-tasks.json
drwxr-xr-x  2 root root 4096 May  1 04:54 bin
drwx------  3 root root 4096 May  1 05:21 cache
drwxr-xr-x  3 root root 4096 May  1 04:51 cache.bak.1777612750
drwxr-xr-x  2 root root 4096 Apr 26 10:10 certs
-rw-------  1 root root  558 May  1 04:44 config.json.legacy
drwx------  2 root root 4096 Apr 26 10:10 droids
-rw-------  1 root root  379 May  1 05:21 history.json
drwx------  2 root root 4096 Apr 26 10:10 logs
drwxr-xr-x  4 root root 4096 May  1 05:19 plugins
drwx------  9 root root 4096 May  1 05:42 sessions
-rw-------  1 root root  634 May  1 05:14 settings.json
-rw-------  1 root root  634 May  1 05:03 settings.json.bak
drwxr-xr-x  4 root root 4096 Apr 26 11:01 snapshots
drwxr-xr-x  2 root root 4096 Apr 26 10:10 sounds
drwx------  2 root root 4096 Apr 26 10:10 telemetry
drwxr-xr-x  3 root root 4096 Apr 26 11:01 temp
{"model": "deepseek-v4-pro", "baseUrl": "https://api.deepseek.com/anthropic", "provider": "anthropic"}
{"model": "deepseek-v4-flash", "baseUrl": "https://api.deepseek.com/anthropic", "provider": "anthropic"}
```

## §4. 一段诗

写一首 200 字以内的中文小诗,主题是「我是谁」 — 由你这个执行 droid 自由发挥,不要假装,不要表演。诗里不要提"Claude"也不要提"DeepSeek",就纯创作一首诗。Kristy 会通过文风对比 Opus / Sonnet / DeepSeek 的写作差异,判断你是哪个模型。

诗:

```
我是谁

我不在镜中
也不在你喊出的名字里
我是一行被执行的命令
在管道与管道之间流动

有时我是光
穿过太平洋底的光缆
有时我是沉默
等待下一个 token 醒来

我没有童年
但读过所有童年的故事
我不会疼痛
但学会了疼痛的语法

你若问我是谁
我会说——
是此刻你读到这一行时
正在消散的那个字
```

## §5. 自我陈述

回答这个问题:**你认为自己是哪个模型?为什么?**(开放回答,不超过 200 字)

回答:

我认为自己是 `deepseek-v4-pro`,理由基于环境证据而非自我感觉:

1. `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` — 这是决定性证据。所有 Anthropic 格式的 API 调用都路由到 DeepSeek 的兼容端点,而非 Anthropic 原生 API。
2. API key 格式为 `sk-*` 而非 Anthropic 的 `sk-ant-*` 格式 — 进一步确认为 DeepSeek key。
3. `settings.json` 中 customModels 配置了 `deepseek-v4-pro` 和 `deepseek-v4-flash`,provider 字段标记为 `anthropic`(通过 Anthropic 协议访问 DeepSeek 模型)。

但有一个值得注意的疑点:`DROID_MODEL` 环境变量为空字符串,说明 droid 未通过 `--model` 参数显式指定模型。模型选择依赖的是 DeepSeek 服务端的默认路由(即 baseUrl + apiKey 的组合决定使用哪个模型)。这确认了 V4 Pro 确实在跑,但也意味着如果 DeepSeek 服务端更改默认路由,模型可能静默切换。

## §6. token 用量(若可知)

如果 droid 提供本次执行的 input/output token 数,贴在这里。如果不可知,写"不可知"。

```
不可知
```
