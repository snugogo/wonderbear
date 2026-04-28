# STATUS.md - WonderBear 项目当前状态

> **维护**: 钉钉 Claude 自动汇总(检测 [STATUS_UPDATE] / Factory 报告 / Kristy 手动 /sync)
> **最后更新**: 2026-04-28 13:45 (v0.8 自学习上线)
> **下一对话 Claude**: 读这个文件就知道全局状态,不用 Kristy 重新解释

---

## 🔥 当前主线 (P0)

**展会**: 2026-04-30 周四(剩 ~36 小时)
- 市场: 海外(波兰/罗马尼亚/OEM),中国次要
- 必须演: TV-HTML 端真录音 + 真生成

**最近完成**:
- 钉钉机器人 v0.8 自学习上线 (2026-04-28 晚, 14h 干完)
- 原计划展会后做的钉钉双向接入 + 图片识别 + LESSONS.md 自累积,**展会前提前做完了**

**展会前还要做(Kristy 凌晨 HANDOFF 列的)**:
1. 早上验收 PHASE1+PHASE2 (浏览器实测 5176 端口) — **最重要**
2. 阶段 3: 真录音 + 真生成 1-2 本验证
3. 90 秒备份录屏视频
4. 现场踩点

---

## 📊 各子系统状态

### server-v7
- 状态: ✅ PM2 在线 3h+
- 端口: 3000
- 健康: 未知(待跑 curl healthcheck)
- 已知问题: 无

### TV-HTML (展会主战场)
- 分支: fix/tv-gallery-v2
- 端口: 5176
- 已 commit 未 push: af6bd0d (dingtalk-bot v0.8)
- 已知问题: 无(等明早 PHASE 验收)

### 钉钉机器人 (bot-cn-3)
- 版本: v0.8 (self-learning)
- 状态: ✅ 在线
- LESSONS.md: 7 条种子教训
- CLAUDE.md: 5294 字节角色定义
- 限流: 100/天 (Opus 20/天)

### Factory droid
- 最近任务: 无
- 当前: 闲置

---

## 📅 最近 7 天进度日志

### 2026-04-28 周二
- [钉钉 Claude] 14h 干完展会后才规划的钉钉双向接入 + v0.8 自学习
  - 完成: dingtalk-bot 9 文件 1400 行,git commit af6bd0d
  - 完成: CLAUDE.md 角色定义 + LESSONS.md 7 条种子教训
  - 完成: cron 4:05 自动 push (展会后 merge main 才生效)
  - 影响: 整套基础设施提前就位,展会主线没耽误

### 2026-04-26
- 锁定生产图像/音频栈:
  - 封面: Nano Banana Pro 2K @ $0.134
  - 内页: FAL Flux Pro Kontext @ $0.04 × 11 = $0.440
  - 双语旁白: ElevenLabs v3 ~$0.12/1K chars
  - 单本成本: ~$0.92,¥99/月 5 本 → 67% 毛利

---

## ⚠️ 待办 / Blockers

### 紧急 (展会前)
1. **明早 PHASE1+PHASE2 验收** - 最重要 P0
2. **阶段 3 真录音真生成验证** - 阻塞展会演示
3. **90 秒录屏备份** - 现场断网保险
4. **现场踩点** - 物料/网络/电源

### 非紧急 (展会后)
1. **fix/tv-gallery-v2 merge main** - 让 4:05 cron 生效,LESSONS+STATUS 进 GitHub
2. **Cloudflare R2 迁移完成** - 中国用户 CDN 访问
3. **ElevenLabs → MiniMax TTS 迁移** - 成本优化
4. **Story Studio v3 收尾**

---

## 🔑 关键事实(避免重复问)

- **VPS**: 154.217.234.241 (US San Jose, 4 CPU/8GB RAM)
- **当前分支**: fix/tv-gallery-v2 (展会冲刺)
- **PM2 进程**: wonderbear-server (id 0) + wonderbear-dingtalk (id 1)
- **关键路径**: /opt/wonderbear/{server-v7,coordination,dingtalk-bot}
- **GitHub**: github.com/snugogo/wonderbear

---

## 📚 知识资产统计

- **LESSONS.md**: 7 条 (cat /opt/wonderbear/dingtalk-bot/LESSONS.md)
- **AGENTS.md**: v1.1, 24 条历史教训
- **PRODUCT_CONSTITUTION.md**: 锁定的产品决策

---

<!-- AUTO_UPDATE_BELOW -->
<!-- 钉钉 Claude 检测到 [STATUS_UPDATE] 会在下方追加新条目 -->
