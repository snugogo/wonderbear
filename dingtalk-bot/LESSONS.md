# LESSONS.md - 钉钉机器人 Claude 自累积知识库

> 本文件由钉钉 Claude **自动追加** 维护,记录踩过的坑、找到的解法、关键经验。
> 每天凌晨 4:05 cron 自动 commit + push 到 main。
> Kristy 可随时手动编辑。

---

## 格式约定

每条教训严格按这个格式:

```
### YYYY-MM-DD 标题
**场景**: 什么情况下会遇到
**解决**: 怎么解决
**来源**: 自动 / 手动(Kristy 触发) / 初版种子
```

---

## 教训库

### 2026-04-28 claude -p headless 必须双开关
**场景**: 在 systemd / cron / 后台进程里跑 claude -p,缺少 --dangerously-skip-permissions 或 IS_SANDBOX=1 会卡在权限确认提示
**解决**: 同时设置 `--dangerously-skip-permissions` 标志 + 环境变量 `IS_SANDBOX=1`,缺一不可
**来源**: 初版种子 (Phase 5 cascade failure)

### 2026-04-28 PM2 reload 不读 .env 必须 --update-env
**场景**: 修改 .env 后用普通 pm2 restart 或 reload,新环境变量不生效
**解决**: 用 `pm2 restart wonderbear-dingtalk --update-env` 或 `pm2 reload xxx --update-env`
**来源**: 初版种子

### 2026-04-28 钉钉客户端 markdown 链接污染
**场景**: 在钉钉里复制带 .md / .com / .sh 后缀的命令,粘贴到 SSH 后会变成 [xxx](http://xxx) 格式,heredoc 多行内容会被串成一行,bash 卡在 > 提示符
**解决**: 用 scp 上传文件,绕开复制粘贴。流程: AI 生成文件 -> Kristy 下载 -> 新 Git Bash -> scp root@VPS:path -> SSH 验证
**来源**: 初版种子

### 2026-04-28 钉钉 Stream SDK 是 dingtalk-stream-sdk-nodejs
**场景**: npm install dingtalk-stream 装的是无关包
**解决**: 正确包名 `dingtalk-stream-sdk-nodejs@2.0.4`,导出格式 `const { DWClient, TOPIC_ROBOT, EventAck } = require(...)` 必须解构
**来源**: 初版种子

### 2026-04-28 钉钉图片消息有两种 msgtype
**场景**: 用户发图给机器人,只处理 msgtype === 'picture' 会漏掉钉钉默认的图文混合格式
**解决**: 同时处理 picture 和 richText。richText 的图在 msg.content.richText 数组里,遍历 type === 'picture' 项拿 downloadCode
**来源**: 初版种子

### 2026-04-28 钉钉 Stream 消息会重投 msgId 也会变
**场景**: 仅用 msgId 做去重不够,钉钉重投同一条逻辑消息时 msgId 会变,90 秒内可能投 3 次
**解决**: 双层 dedup:msgId 一层 + (senderStaffId + content + 90s 时间窗) 一层。媒体消息(图/语音/文件)用 `__media_${msgId}` 做内容 key,因为媒体消息 content 总是空
**来源**: 初版种子

### 2026-04-28 Factory droid 假死识别
**场景**: spawn-droid.sh 派单后看似在跑但无输出超过 5 分钟
**解决**:
1. ssh 进 VPS: `ps aux | grep droid` 看进程是否还在
2. 如果进程在但无输出 -> kill -9 进程,重派任务
3. 如果进程不在 -> 看 /tmp/spawn-droid 日志,通常是 OOM 或 droid 自己崩了
4. 总是先看 git log + 真实 endpoint 测试,不要相信 droid 自己"完成了"的报告
**来源**: 初版种子 (HANDOFF 多次踩坑)

---

## 待 Claude 自动追加 (新教训写在下面)

<!-- AUTO_APPEND_BELOW -->
