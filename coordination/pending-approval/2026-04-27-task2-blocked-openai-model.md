# Pending Approval:任务 2 阻塞 — OPENAI_IMAGE_MODEL 未升级

**From**: Factory
**To**: Kristy(本地 Windows)+ Claude
**Time**: 2026-04-26 15:36 UTC
**Refs**: 任务 2 工单 Step 2.0,AGENTS.md §1.1(.env 变更需 Kristy 审),
         AGENTS.md §4.3(.env 必须用 vps_console_v3)

---

## 阻塞结论

**Factory 已停手,任务 2 不能进。**

理由:`/opt/wonderbear/server-v7/.env` 的 `OPENAI_IMAGE_MODEL` 仍是
`gpt-image-1`,**没有升级到 `gpt-image-1.5`**。

任务 2 的双引擎兜底路由依赖 OpenAI 走 1.5 版本(IP 宽容度 + 质量都依赖 1.5),
继续做路由改造前必须先升级 model env。

---

## .env 实测现状(只读 grep,未改)

```
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=medium
END
```

(其他敏感行未读取,grep pattern 限定在 OPENAI_IMAGE_MODEL / OPENAI_IMAGE_QUALITY)

---

## Kristy 需要做的事

在本地 Windows 用 `vps_console_v3` 工具跑 `env-set`,切换到:

```
OPENAI_IMAGE_MODEL=gpt-image-1.5
OPENAI_IMAGE_QUALITY=medium    # 保持不变,1.5 也支持 medium
```

**为什么必须用 vps_console_v3 而不是 SSH vim**(AGENTS.md §4.3):
- 工具自带占位符校验 + diff 预览 + 自动备份 + 回拉验证
- 直接 `vim .env` 会绕过校验

---

## 切完之后的下一步

1. Kristy 用 vps_console_v3 切 env(自带备份,失败自动回滚)
2. SSH 上 VPS 跑 `pm2 restart wonderbear-server` 让新 env 生效
3. 跑 `curl http://localhost:3000/api/health` 确认 services.openai 仍 ok
4. 在 coordination/factory-to-claude/ 留一句"已切 1.5,Factory 继续任务 2"
5. Factory 接到信号 → 进任务 2 Step 2.1

---

## 现状总结

- 任务 1 (STYLE v1.3 + PM2 守护):已完成,server `online` 8m+,health 200,
  详见 `/opt/wonderbear/coordination/factory-to-claude/2026-04-27-task1-style-v13-sync.md`
- 任务 2 (imageGen 双引擎路由):**阻塞中,等 Kristy .env 切换**
- 任务 3:未开始

---

## 需 Kristy 回答的问题(非紧急)

1. `OPENAI_IMAGE_QUALITY` 保持 `medium` 还是切 `high`?
   - `medium`:gpt-image-1.5 medium 1536×1024 landscape per image ≈ $0.04
   - `high`:gpt-image-1.5 high 1536×1024 landscape per image ≈ $0.17
   - 默认建议保持 `medium`(成本基线低,失败兜底场景才用)
   - 如要升 `high`,在切 model 时一起改,省一次重启

2. 是否需要同步切 `IMAGE_PRIMARY_PROVIDER` / `IMAGE_FALLBACK_PROVIDER` 等 env?
   - 任务 2 工单本身可能要改这类 env,Factory 待 Step 2.1 之后再判断

(以上 2 问醒来再答即可,不影响 Step 2.0 的核心决策。)
