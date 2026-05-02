// ============================================================================
// /api/draft/* — Story-draft persistence (WO-3.18 Phase 4)
//
// STATUS: contract-only stub.
//
//   Per WO-3.18 §execution Step 4.2 取证:
//     - deviceId 已在 server-v7 / tv-html 全栈使用 (Device.deviceId @unique).
//     - WO §execution table says: deviceId 已存在 → 应做 4.2a 后端持久化.
//
//   选择降级到 4.2b (localStorage on TV) 的原因(详见 .phase-4-survey.txt):
//     1. AGENTS.md §1.1 禁止 exec mode 的 droid 自主跑 prisma migration.
//     2. WO §risk Risk 5 - migration 失败会让 server 起不来,需要人工
//        backup PG + rollback,exec mode 没有可靠的 docker / pm2 通道.
//     3. prisma/migrations/ 目前为空,项目历史是 db push 而非 migrate;
//        新引入 migrate 文件 + 不跑迁移会让 schema 真值脱钩,P0 风险.
//
//   本文件存在的意义:
//     A. 把 Phase 3 LLM 输出契约 (should_summarize / story_summary) 文档化
//        为 server 端共识,在 WO-3.18.1 / WO-3.19 完整后端化时直接照搬.
//     B. 占位 Phase 4 backend route 的实现位置,供未来 migration 安排好后,
//        Kristy 与下个 Agent 知道在哪里挂 prisma upsert / GET / DELETE.
//
//   注:本文件目前 NOT registered in app.js — 没有 prisma model 挂钩前
//        register 反而会让任何 GET 调用炸 500. 等 schema migration 上线后
//        在 app.js routes 区段加: await app.register(draftRoutes, { prefix: '/api/draft' });
// ============================================================================

/**
 * Phase 3 LLM dialogue contract reference.
 *
 * The LLM SHOULD eventually emit, in addition to the v7.2 fields, two
 * extra keys when the bear judges the story is rich enough to be
 * confirmed by the child:
 *
 *   should_summarize  : boolean — true if the bear is asking the child
 *                       to confirm "start painting?". This is independent
 *                       of `done` (which still represents "we have run
 *                       out of rounds / hard cap reached").
 *   story_summary     : string | null — the bear's one-sentence summary
 *                       in the child's primary language, e.g.
 *                       "我们来一起画一个 X 的故事吧?".
 *
 * The TV (DialogueScreen.vue) currently consumes these fields when the
 * server emits them (back-compat: missing/false → legacy ASKING flow).
 * The route handler in routes/story.js does NOT yet pass them through —
 * that is the WO-3.18.1 cleanup task once the LLM prompt is updated by
 * Kristy + reviewed in production. This file pins the contract so the
 * TV implementation and future server work agree on field names.
 */
export const DIALOGUE_CONFIRM_CONTRACT = Object.freeze({
  // Phase 3 LLM fields (extend v7.2 dialogue turn JSON shape):
  should_summarize: 'boolean',
  story_summary: 'string|null',
  // Phase 4 future StoryDraft model shape (mirror of localStorage payload):
  storyDraft: Object.freeze({
    deviceId: 'string',
    conversationHistory: 'Json',
    outlineSummary: 'string|null',
    protagonistName: 'string|null',
    turnCount: 'number',
    status: ['waiting_confirm', 'abandoned'],
    expiresAt: 'DateTime',
  }),
});

/**
 * Phase 4 future API surface (NOT yet wired into app.js):
 *
 *   POST   /api/draft                 — upsert draft (deviceId from token)
 *   GET    /api/draft/active          — fetch active draft for this device
 *   DELETE /api/draft/:id             — clear draft (after generate kickoff)
 *
 * The TV today calls saveDraft / loadDraft / clearDraft against
 * localStorage (see tv-html/src/stores/draft.ts). When this route
 * group is activated, wrap those helpers with a network call (with
 * localStorage as offline fallback) so existing TVs don't regress.
 */
export default async function draftRoutes(/* fastify */) {
  // Intentional no-op until WO-3.18.1 hooks in the Prisma StoryDraft
  // model. Registering an empty plugin would still install /api/draft
  // as a 404 surface; we leave the export here as a marker for the
  // next contributor to extend.
}
