# WO-3.15 — Tooling Hygiene 完成报告

**From**: Factory (V4 Pro / deepseek-v4-pro via droid v0.114.0)
**To**: Kristy / VPS Claude
**Time**: 2026-05-01
**Branch**: `release/showroom-20260429`
**Base commit**: `b0cef44 feat(tv+server): WO-3.12 StoryCoverScreen first-time overlay`
**Refs**: WO-3.15 README §1-§8, AGENTS.md 教训 11/12/14/16/17/18

---

## §1. 执行摘要

按 WO-3.15 README 要求的 3-part bundle 全部完成,无产品代码改动:

1. ✅ 新增 `coordination/GROUND-TRUTH.md`(153 行,§1-§10 全部填充真实 grep 值)
2. ✅ 新增 `workorders/verify-template.sh`(可执行,bash -n 通过,内嵌 5 类 mock 路径排除 + services/api.ts / stores 白名单)
3. ✅ `server-v7/.env` 去重 `GOOGLE_APPLICATION_CREDENTIALS`(2 → 1)
4. ✅ `server-v7/.env.example` 删除 `STORAGE_TYPE` / `LOCAL_STORAGE_PATH`(替换为说明注释)
5. ⚠️ 注:`GEMINI_IMAGE_MODEL` / `STORAGE_TYPE` / `LOCAL_STORAGE_PATH` 在 `.env` 中**本来就不存在**(grep 0 hit),验收标准已自动满足。

WO-3.15-verify.sh 自检结果:**14/15 PASS + 1 FAIL**(check 12 已知误报,见 §5)。

---

## §2. 基线状态确认(改动前)

```
$ git rev-parse --abbrev-ref HEAD
release/showroom-20260429

$ git log -1 --oneline
b0cef44 feat(tv+server): WO-3.12 StoryCoverScreen first-time overlay + author display + TTS

$ git status -s | grep -E '^[ MARC][MARC]?\s' | wc -l
0
$ git status -s | wc -l
51   (51 全是 ?? untracked,无 M/A/D/R/C)
```

base state OK,符合 WO §0 要求。

---

## §3. 改动清单

| 文件 | 类型 | 净行数 | 说明 |
|---|---|---|---|
| `coordination/GROUND-TRUTH.md` | NEW | +153 | §1 infra / §2 PM2 / §3 dispatch chain / §4 models / §5 .env / §6 DB / §7 verify rules / §8 file layout / §9 skills / §10 known bugs |
| `workorders/verify-template.sh` | NEW | +144 (chmod +x) | Luna grep 排除 demoStory/demo/test/mock/fixture/__tests__;spillover whitelist 增加 services/api.ts + stores/*.ts;所有 grep -c 加 `\|\| true`,所有数值比较加 `tr -d ' '` |
| `server-v7/.env` | MODIFY | -1 | 删除 line 54 空 `GOOGLE_APPLICATION_CREDENTIALS=`(line 122 才是真实路径,dotenv 后写胜出) |
| `server-v7/.env.example` | MODIFY | -3 / +2 | 删除 `STORAGE_TYPE=local` / `LOCAL_STORAGE_PATH=./storage`,替换为 WO-3.15 标注注释 |

git status 增量(只看 M):

```
$ git status -s | grep -E '^[ MARC][MARC]?\s'
 M server-v7/.env.example
```

`.env` 不在 git tracking 内(`.gitignore` 命中);两个新文件是 untracked。spillover whitelist 通过。

---

## §4. 详细取证

### §4.1 .env 死字段调研结果

| 字段 | 在 .env 中 | 在 src/ 中 | 在 .backup-* 中 | 处置 |
|---|---|---|---|---|
| `GEMINI_IMAGE_MODEL` | 0 hit | 0 hit | 0 hit | 已自然消失,无须改 |
| `STORAGE_TYPE` | 0 hit | 0 hit (live src) | 1 hit (env.js.backup-*) | .env 本就没有;已从 .env.example 删除 |
| `LOCAL_STORAGE_PATH` | 0 hit | 0 hit (live src) | 1 hit (env.js.backup-*) | 同上 |
| `GOOGLE_APPLICATION_CREDENTIALS` | **2 hit** | 1 hit (env.js, 正常) | — | 删除 line 54 的空值,保留 line 122 的真实路径 |
| `DASHSCOPE_TTS_VOICE_ZH/EN/VOCAB`(无 _NARRATION/_DIALOGUE 前缀) | 各 1 hit | **多处 live 引用**(`src/services/tts.js` lines 72/73/74/111/335,`src/config/env.js` lines 58-62) | — | **保留**(WO §2.C 指示:有引用就保留) |

### §4.2 .env 改动 diff

```diff
@@ line 54 @@
 GOOGLE_SPEECH_KEY=AIzaSy...(实际 key,Read 工具自动 mask)
-GOOGLE_APPLICATION_CREDENTIALS=
-
+
 # ----- [stripe] 订阅支付主通道 / 批次 5 用 -----
@@ line 122 (已经存在,未变) @@
 GOOGLE_APPLICATION_CREDENTIALS=/opt/wonderbear/server-v7/secrets/google-speech-credentials.json
```

净行数:-1。改动前 160 行 → 改动后 159 行。

### §4.3 .env.example 改动 diff

```diff
@@ around line 88 @@
-# Local-dev only: switch storage backend
-STORAGE_TYPE=local
-LOCAL_STORAGE_PATH=./storage
+# (removed by WO-3.15: STORAGE_TYPE / LOCAL_STORAGE_PATH — only referenced in
+#  src/config/env.js.backup-* files, no live code path. R2 is the canonical store.)
```

### §4.4 备份纪律

按 AGENTS.md §2.1,改动前已备份:

- `/opt/wonderbear/server-v7/.env.backup-2026-05-01-wo3.15-pre`
- `/opt/wonderbear/server-v7/.env.example.backup-2026-05-01-wo3.15-pre`

回滚命令(若需):
```bash
cp /opt/wonderbear/server-v7/.env.backup-2026-05-01-wo3.15-pre /opt/wonderbear/server-v7/.env
cp /opt/wonderbear/server-v7/.env.example.backup-2026-05-01-wo3.15-pre /opt/wonderbear/server-v7/.env.example
```

---

## §5. 自检结果(WO-3.15-verify.sh)

```
[1/15]  GROUND-TRUTH.md exists (153 lines)         ✅ PASS
[2/15]  GROUND-TRUTH §1-§10 sections (10/10)       ✅ PASS
[3/15]  GROUND-TRUTH key facts (4/4)               ✅ PASS
[4/15]  verify-template.sh exists & executable     ✅ PASS
[5/15]  verify-template.sh bash -n syntax          ✅ PASS
[6/15]  verify-template Luna excludes 5 patterns   ✅ PASS  (5/5: demoStory/demo/test/mock/fixture)
[7/15]  spillover whitelist allows api.ts/stores   ✅ PASS
[8/15]  .env: GEMINI_IMAGE_MODEL removed           ✅ PASS  (0)
[9/15]  .env: STORAGE_TYPE removed                 ✅ PASS  (0)
[10/15] .env: LOCAL_STORAGE_PATH removed           ✅ PASS  (0)
[11/15] .env: GOOGLE_APPLICATION_CREDENTIALS dedup ✅ PASS  (1)
[12/15] No live src/ refs to removed fields        ❌ FAIL  (2 hits in src/config/env.js.backup-2026-04-30-wo2-pre)
[13/15] WO-3.9 Luna invariant (filtered)           ✅ PASS  (0)
[14/15] V4 Pro migration scripts                   ✅ PASS  (2/2)
[15/15] no spillover into product code             ✅ PASS

Summary: 14/15 PASS, 1 FAIL
```

### §5.1 关于 check [12/15] FAIL

**这是一个误报**,且**讽刺地正是 WO-3.15 自身要消除的那类 false-positive**:

- `WO-3.15-verify.sh` 内嵌的 grep 是 `grep -rln "process\.env\.${FIELD}\b" "${SERVER_DIR}/src"`,**未排除 `.backup-*` 文件**。
- 命中的 2 处是 `src/config/env.js.backup-2026-04-30-wo2-pre`(WO-2 改动前的 env.js 历史备份),已被 `.gitignore` 的 `**/*.backup-*` 规则忽略,不进 git,**不是 live code**。
- 加了 `--exclude='*.backup-*'` 后 hit 数为 0:

  ```
  $ grep -rn "process\.env\.\(STORAGE_TYPE\|LOCAL_STORAGE_PATH\|GEMINI_IMAGE_MODEL\)" \
      /opt/wonderbear/server-v7/src --exclude='*.backup-*'
  (empty)
  ```

- 按 WO §6 "Files to touch" 表,`workorders/WO-3.15-verify.sh` **不在允许修改列表**,且 §2.D 明示 "Don't refactor existing WO-X-verify.sh files"。所以**不修复**这个 verify.sh 自身的 grep 缺陷。
- 新生成的 `workorders/verify-template.sh` 已**正确包含**这个排除规则(Luna 检查里有 `grep -v '\.backup'`),后续工单 verify.sh 都从这里 derive,不会再触发。

如 Kristy 后续单独发一个 micro-WO 修 `WO-3.15-verify.sh` check 12 的 grep 也行,但当前 WO 不该改。

---

## §6. WO-3.15 验收标准对照

| # | 验收项 | 状态 | 证据 |
|---|---|---|---|
| 1 | `GROUND-TRUTH.md` ≥ 100 行,§1-§10 真实数据 | ✅ | 153 行,所有占位符已用 grep/cat/pm2 jlist 实测填充 |
| 2 | `verify-template.sh` 存在 + chmod +x + bash -n 通过 | ✅ | 144 行,可执行 |
| 3 | `.env` 无 `GEMINI_IMAGE_MODEL=` / `STORAGE_TYPE=` / `LOCAL_STORAGE_PATH=` | ✅ | 全 0(本来就不在) |
| 4 | `.env` 中 `GOOGLE_APPLICATION_CREDENTIALS=` 恰好 1 次 | ✅ | 1 |
| 5 | 改动文件:`.env` + (可选) `.env.example`,无产品代码改动 | ✅ | git status 仅 `M server-v7/.env.example`,`.env` gitignored,无 src/ 改动 |
| 6 | WO-3.9 Luna invariant 仍成立(排除 demoStory) | ✅ | 0 hit |
| 7 | spawn-droid.sh / orchestrator-loop.sh 与 b0cef44 一致 | ✅ | 两脚本仍用 `deepseek-v4-pro` |

---

## §7. 红线遵守对照(WO §5)

| 红线 | 状态 |
|---|---|
| `.env` 净改动 4-7 行删除,无新增(注释除外) | ✅ -1 line |
| 新文件:GROUND-TRUTH.md + verify-template.sh | ✅ 共 2 个 |
| verify 子进程不用 `&&` 链式 | ✅ |
| 文件写入只用 create_file / Edit | ✅ |
| 未跑 git stash / reset / push / commit | ✅ |
| 未触发 "Always allow" | ✅ |

---

## §8. 期望 next action(给 Kristy)

1. **Review GROUND-TRUTH.md 内容**(单一事实源,新对话首读),特别是 §3 dispatch chain、§5 .env 列表、§7 verify 规则,如需补充字段/纠正描述就直接改即可。
2. **Review verify-template.sh** 的 5 类 mock 路径排除是否完整,有遗漏请补加 grep -v 行。
3. 若同意,可手动 commit:
   ```bash
   git add coordination/GROUND-TRUTH.md \
           workorders/verify-template.sh \
           server-v7/.env.example
   # .env 不入库
   git commit -F coordination/workorders/WO-3.15/COMMIT_MSG  # 用 WO §8 模板
   ```
4. **可选 micro-WO**:修 `WO-3.15-verify.sh` check 12 的 grep,加 `--exclude-dir='*.backup*' --exclude='*.backup-*'`,消除 .backup 文件的 false-positive(verify-template.sh 已经避开了这个坑)。

---

## §9. 教训应用记录

- **教训 11**(备份脚本不能用 Prisma model)→ §6 已写入 GROUND-TRUTH,backup-daily.sh 用 raw `pg_dump`
- **教训 12**(`&&` 短路不触发 set -e)→ verify-template 全部用独立 `if`/`fi`,无 `&&` 链
- **教训 14/16**(Fail Fast on Config / 配置错误潜伏成本高)→ 删除 .env 中真正死掉的字段,降低未来 silent failure 风险
- **教训 17**(工具是纪律的物质载体)→ verify-template.sh 让"Luna 误报""api.ts 误报"两类 false-positive 物理上无法再发生
- **教训 18**(安全默认值是 P0 风险来源)→ 不适用本 WO,但 GROUND-TRUTH §10 P3 列了 5 leaked credentials TODO
- **教训 19**(定价数字 4 维度)→ GROUND-TRUTH §4 全部按 model + quality + resolution + 单位写

---

End of WO-3.15 report.
