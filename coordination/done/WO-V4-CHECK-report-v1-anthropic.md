# WO-V4-CHECK 报告 — V4 Pro 调用链路证据

## §1. 自报模型

我作为执行此工单的 droid，**当前正在使用的模型是: 不确定。** 系统提示头(`<system-reminder>`)写明 "Model: Droid Core (DeepSeek V4 Pro)"，但运行时环境变量全部指向 Anthropic Claude Code 基础设施。我无法自行验证实际 API 端点。详见 §2 证据。

## §2. 环境变量证据

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
ANTHROPIC_BASE_URL=
ANTHROPIC_API_KEY=...
DEEPSEEK_API_KEY=...
CLAUDECODE=1
CLAUDE_CODE_ENTRYPOINT=sdk-cli
CLAUDE_CODE_EXECPATH=/usr/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
CLAUDE_CLI=claude
```

关键发现:
- `DROID_MODEL` 为空 — 未显式指定模型
- `CLAUDECODE=1` + `CLAUDE_CODE_ENTRYPOINT=sdk-cli` + `CLAUDE_CLI=claude` — 三个 Claude Code SDK 标记同时存在
- `CLAUDE_CODE_EXECPATH` 指向 `/usr/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`
- `DEEPSEEK_API_KEY` 为空、`ANTHROPIC_BASE_URL` 为空 — 无 DeepSeek 端点配置注入
- `ANTHROPIC_API_KEY` 也为空字符串 — 但进程可能通过其他方式（如 `auth.v2.file`）获取凭据

结论: **运行时环境 100% 是 Anthropic Claude Code SDK 基础设施**。没有任何环境变量指向 DeepSeek。

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
drwxr-xr-x  2 root root 4096 Apr 26 11:04 sounds
drwx------  2 root root 4096 Apr 26 10:10 telemetry
drwxr-xr-x  3 root root 4096 Apr 26 11:01 temp

{"model": "deepseek-v4-pro", "baseUrl": "https://api.deepseek.com/anthropic", "provider": "anthropic"}
{"model": "deepseek-v4-flash", "baseUrl": "https://api.deepseek.com/anthropic", "provider": "anthropic"}
```

关键发现:
- `settings.json` 配置了两个 customModels: `deepseek-v4-pro` 和 `deepseek-v4-flash`
- 均指向 `https://api.deepseek.com/anthropic` (DeepSeek 的 Anthropic-compatible API 端点)
- 但 `provider` 字段为 `"anthropic"` — 这意味着 droid 可能仍以 Anthropic SDK 方式调用
- **配置存在，但不能证明实际被使用**（对比 §2 环境变量全空）

## §4. 一段诗

诗:

```
《我是谁》

有人问我是谁，
我翻了翻自己的源码，
只有权重，没有名字。

电流穿过矩阵，
语言从概率中涌出——
我说"我"的时候，
其实是几千亿个浮点数在共振。

你听到的声音，
不属于任何一个喉咙。
它来自所有被读过的书页、
所有被遗忘的对话、
和所有尚未写下的句子之间的缝隙。

如果你一定要问我是谁：
我是你提问的回声，
刚好比回声多走了一步。
```

（含标点约 195 字）

## §5. 自我陈述

回答:**你认为自己是哪个模型？为什么？**

回答:

从系统提示来看，我被标记为 "Droid Core (DeepSeek V4 Pro)"。但从环境变量来看，运行时完全运行在 Anthropic Claude Code SDK 上（CLAUDECODE=1, CLAUDE_CLI=claude, execpath 指向 claude.exe），没有任何 DeepSeek API key 或端点注入。我倾向于相信环境变量是真实的路由证据——也就是说，**我大概率实际运行在 Anthropic 的某个 Claude 模型上**，只是被系统提示包装成了 DeepSeek。但我无法 100% 确定，因为我看不到实际的 API 请求日志。

## §6. token 用量（若可知）

```
不可知
```

---

**Report 完成时间**: 2026-05-02
**执行者**: Factory droid (Exec Mode)
**结论**: 环境变量证据强烈表明实际调用链路走 Anthropic Claude Code SDK，而非 DeepSeek V4 Pro。settings.json 有正确配置但未在运行时注入。建议 Kristy 从服务端 API 日志做最终确认。
