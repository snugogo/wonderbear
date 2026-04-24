# Phase A · image-2 availability probe

**Date**: 2026-04-24
**Prompt**: `a cute teddy bear waving in a sunny watercolor meadow, soft children's book illustration`
**Size**: `1536x1024`
**Script**: `tools/probe_image2.sh`
**Artifacts**: `tools/reports/probe_phase_a/`

## Results

| # | model | quality | HTTP | bytes | duration | artifact |
|---|---|---|---|---|---|---|
| 1 | `gpt-image-2` | high | **403** | 0 | 1 s | `01-image2-high.err.txt` |
| 2 | `gpt-image-2` | medium | **403** | 0 | 1 s | `02-image2-medium.err.txt` |
| 3 | `gpt-image-1.5` | high | **200** | 3 270 588 (3.12 MB) | 50 s | `03-image1.5-high.png` |
| 4 | `gpt-image-1` | medium | **200** | 2 321 934 (2.21 MB) | 25 s | `04-image1-medium.png` |

## image-2 error body (identical for both quality tiers)

```json
{
  "error": {
    "message": "Your organization must be verified to use the model `gpt-image-2`. Please go to: https://platform.openai.com/settings/organization/general and click on Verify Organization. If you just verified, it can take up to 15 minutes for access to propagate.",
    "type": "invalid_request_error",
    "param": null,
    "code": null
  }
}
```

## 结论 + 分叉判断

按工单 §8 Q1:`403 access denied / verification required` → 把完整错误体贴主控台,等主控台去 OpenAI dashboard 申请。

这命中工单 §2.4 的 **情况 2**(image-2 全 4xx):

> **情况 2**:image-2 全 4xx(权限/资格问题)→ 把错误体贴主控台,启动 **Plan B**(改 OPENAI_IMAGE_MODEL=gpt-image-1.5,跳过 Phase B 直接进 Phase C)

对照组两个 200 都正常,说明:
- OpenAI key / 账户余额 / 网络一切正常
- Plan B(`gpt-image-1.5 high`)在同一 prompt + 1536x1024 下稳定出图,首样本 3.12 MB / 50 s

## 等主控台的两个决策点

1. **是否现在去 OpenAI dashboard 点 Verify Organization**(https://platform.openai.com/settings/organization/general)?文档说生效最多 15 分钟。
   - 如果做了:**Phase A 重跑一次**(只重跑 01/02 两档),如果 200 再继续原计划 Phase B(三方对比含 image-2)。
   - 如果不做或不想做:**启动 Plan B**,跳过 Phase B,直接把生产切到 `gpt-image-1.5 high`,进 Phase C。

2. **如果启动 Plan B,Phase B 三方对比是否仍要做**(用 `gpt-image-1.5 high` + `gpt-image-1 medium` + Gemini Nano Banana 代替原三方)?
   - 倾向:**做**。三方盲评才是主控台这轮想要的"画质升级决策"依据;跳过 Phase B 直接进 D 容易做完才发现 1.5 的钱没花到刀刃上。
   - 另一个选择:**不做**,直接 Phase C + Phase D。省 ~30 分钟 + ~$0.25。

## 文件清单

- `tools/reports/probe_phase_a/01-image2-high.json`(403 response body)
- `tools/reports/probe_phase_a/01-image2-high.err.txt`(同上,另一份)
- `tools/reports/probe_phase_a/02-image2-medium.json` / `.err.txt`
- `tools/reports/probe_phase_a/03-image1.5-high.png`(3.12 MB, 1536x1024, watercolor teddy bear)
- `tools/reports/probe_phase_a/03-image1.5-high.json`(base64 原始响应)
- `tools/reports/probe_phase_a/04-image1-medium.png`(2.21 MB, 1536x1024)
- `tools/reports/probe_phase_a/04-image1-medium.json`
- `tools/reports/probe_phase_a/_summary.tsv`
