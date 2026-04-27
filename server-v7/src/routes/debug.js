// ============================================================================
// /debug/* — internal preview gallery for the founder.
//
// IMPORTANT:
//   - Only registered when env.DEBUG_GALLERY_PASSWORD is set. Empty password
//     means /debug/* simply doesn't exist (safe default for production).
//   - Wrapped in HTTP Basic Auth. Username can be anything (timing-safe-equal
//     compares only the password).
//   - HTML is hand-rolled to avoid pulling a template engine.
//
// Endpoints:
//   GET /debug/gallery        — list of recent stories (50)
//   GET /debug/story/:id      — details: 12 pages with images + audio players
// ============================================================================

import { timingSafeEqual } from 'node:crypto';
import env from '../config/env.js';

const LIST_LIMIT = 50;

function constantTimeEq(a, b) {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function debugRoutes(fastify) {
  const password = env.DEBUG_GALLERY_PASSWORD;
  if (!password || password.length < 4) {
    fastify.log.warn(
      { route: 'debug' },
      'DEBUG_GALLERY_PASSWORD not set (or <4 chars) — /debug/* routes disabled',
    );
    return;
  }

  // Guard every /debug/* request with Basic Auth.
  fastify.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/debug')) return;
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Basic ')) {
      reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="WonderBear Debug"')
        .header('content-type', 'text/plain; charset=utf-8')
        .send('Auth required');
      return reply;
    }
    let pass = '';
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      pass = idx >= 0 ? decoded.slice(idx + 1) : '';
    } catch {
      pass = '';
    }
    if (!constantTimeEq(pass, password)) {
      reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="WonderBear Debug"')
        .header('content-type', 'text/plain; charset=utf-8')
        .send('Auth failed');
      return reply;
    }
  });

  // -- GET /debug/gallery -----------------------------------------------
  fastify.get('/debug/gallery', async (req, reply) => {
    const stories = await fastify.prisma.story.findMany({
      take: LIST_LIMIT,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        status: true,
        stage: true,
        title: true,
        coverUrl: true,
        pages: true,
        genCostCents: true,
      },
    });
    reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(renderGalleryList(stories));
  });

  // -- GET /debug/proxy-audio?url=<r2-url> -------------------------------
  // Streaming proxy for R2 audio so the <audio> element is same-origin.
  // Avoids any cross-origin / mixed-content / range-request quirks.
  fastify.get('/debug/proxy-audio', async (req, reply) => {
    const targetUrl = req.query?.url;
    if (typeof targetUrl !== 'string' || !targetUrl) {
      reply.code(400).type('text/plain').send('missing url');
      return;
    }
    const r2Pub = env.R2_PUBLIC_URL || '';
    if (!targetUrl.startsWith(r2Pub) && !targetUrl.startsWith('https://pub-')) {
      reply.code(403).type('text/plain').send('forbidden host');
      return;
    }
    const range = req.headers.range;
    let upstream;
    try {
      upstream = await fetch(targetUrl, { headers: range ? { Range: range } : {} });
    } catch (e) {
      reply.code(502).type('text/plain').send(`upstream fetch failed: ${e.message}`);
      return;
    }
    reply.code(upstream.status);
    const passHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag'];
    for (const h of passHeaders) {
      const v = upstream.headers.get(h);
      if (v) reply.header(h, v);
    }
    reply.header('cache-control', 'public, max-age=3600');
    const buf = Buffer.from(await upstream.arrayBuffer());
    reply.send(buf);
  });

  // -- GET /debug/story/:id ---------------------------------------------
  fastify.get('/debug/story/:id', async (req, reply) => {
    const story = await fastify.prisma.story.findUnique({
      where: { id: req.params.id },
    });
    if (!story) {
      reply
        .code(404)
        .type('text/html; charset=utf-8')
        .send('<h1>Story not found</h1><p><a href="/debug/gallery">← back</a></p>');
      return;
    }
    let logs = [];
    try {
      logs = await fastify.prisma.imageGenLog.findMany({
        where: { storyId: story.id },
        orderBy: [{ pageNum: 'asc' }, { tier: 'asc' }],
      });
    } catch {
      logs = [];
    }
    reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(renderStoryDetail(story, logs));
  });
}

// ----------------------------------------------------------------------
// Renderers
// ----------------------------------------------------------------------

function renderGalleryList(stories) {
  const cards = stories.map((s) => {
    const pages = Array.isArray(s.pages) ? s.pages : [];
    const cover = s.coverUrl || pages[0]?.imageUrl || '';
    const cost = ((s.genCostCents || 0) / 100).toFixed(2);
    const title = s.title || '(untitled)';
    return `
      <a href="/debug/story/${escapeHtml(s.id)}" class="card">
        ${cover ? `<img src="${escapeHtml(cover)}" loading="lazy" alt="" />` : '<div class="img-placeholder"></div>'}
        <div class="meta">
          <div class="title">${escapeHtml(title)}</div>
          <div class="id">${escapeHtml(s.id.slice(-12))}</div>
          <div class="time">${escapeHtml(new Date(s.createdAt).toLocaleString())}</div>
          <div class="cost">$${cost} · ${escapeHtml(s.status)} (${escapeHtml(s.stage)})</div>
        </div>
      </a>
    `;
  }).join('');

  return `<!DOCTYPE html><html lang="zh"><head>
<meta charset="utf-8"/><title>WonderBear · Debug Gallery</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;background:#1a1a1a;color:#eee;font-family:system-ui,-apple-system,sans-serif;padding:20px}
  h1{margin:0 0 16px;font-size:22px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .card{display:block;background:#2a2a2a;border-radius:8px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .15s, box-shadow .15s}
  .card:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,.4)}
  .card img,.img-placeholder{width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
  .img-placeholder{display:flex;align-items:center;justify-content:center;color:#555}
  .meta{padding:10px 12px}
  .title{font-weight:600;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .id{font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12px;color:#888}
  .time{font-size:12px;color:#aaa;margin:2px 0}
  .cost{font-size:12px;color:#4af}
  .empty{color:#888;padding:40px 0;text-align:center}
</style></head><body>
<h1>WonderBear Stories · ${stories.length} latest</h1>
${stories.length === 0 ? '<div class="empty">No stories yet.</div>' : `<div class="grid">${cards}</div>`}
</body></html>`;
}

function renderStoryDetail(story, logs) {
  const pages = Array.isArray(story.pages) ? story.pages : [];
  const meta = story.metadata && typeof story.metadata === 'object' ? story.metadata : {};
  const primaryLang = meta.primaryLang || 'zh';
  const learningLang = meta.learningLang && meta.learningLang !== 'none' ? meta.learningLang : null;

  const pageBlocks = pages
    .map((p, i) => {
      const pageNum = p.pageNum || i + 1;
      const pageLogs = logs.filter((l) => l.pageNum === pageNum);
      const winner = pageLogs.find((l) => l.success);
      const provider = winner?.provider || 'unknown';
      const tier = winner?.tier ?? '-';
      const attempts = pageLogs.length;

      const proxyUrl = (u) => `/debug/proxy-audio?url=${encodeURIComponent(u)}`;
      const audioMain = p.ttsUrl
        ? `<div class="audio-row"><span class="lang-tag">${escapeHtml(primaryLang)}</span><audio controls preload="metadata" src="${escapeHtml(proxyUrl(p.ttsUrl))}"></audio></div>`
        : '';
      const audioLearning =
        p.ttsUrlLearning && learningLang
          ? `<div class="audio-row"><span class="lang-tag learning">${escapeHtml(learningLang)}</span><audio controls preload="metadata" src="${escapeHtml(proxyUrl(p.ttsUrlLearning))}"></audio></div>`
          : '';

      const hdLink = p.imageUrlHd
        ? `<a class="hd" href="${escapeHtml(p.imageUrlHd)}" target="_blank" rel="noopener">HD ↗</a>`
        : '';

      return `
        <div class="page">
          ${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" loading="lazy" alt="page ${pageNum}" />` : '<div class="img-placeholder"></div>'}
          <div class="info">
            <span class="num">Page ${pageNum}</span>
            <span class="provider">${escapeHtml(provider)} · tier ${escapeHtml(String(tier))}</span>
            <span class="attempts">${attempts} attempt${attempts === 1 ? '' : 's'}</span>
            ${hdLink}
          </div>
          <div class="audio">${audioMain}${audioLearning}</div>
          <div class="text">${escapeHtml(p.text || '')}</div>
          ${p.textLearning ? `<div class="text learning">${escapeHtml(p.textLearning)}</div>` : ''}
        </div>
      `;
    })
    .join('');

  const cost = ((story.genCostCents || 0) / 100).toFixed(2);

  return `<!DOCTYPE html><html lang="zh"><head>
<meta charset="utf-8"/><title>${escapeHtml(story.title || story.id)} · Debug</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;background:#1a1a1a;color:#eee;font-family:system-ui,-apple-system,sans-serif;padding:20px}
  .back{display:inline-block;margin-bottom:14px;color:#4af;text-decoration:none}
  h1{margin:0 0 4px;font-size:24px}
  .sub{color:#888;margin:0 0 18px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px}
  .page{background:#2a2a2a;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
  .page img,.img-placeholder{width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
  .img-placeholder{display:flex;align-items:center;justify-content:center;color:#555;font-size:13px}
  .info{padding:8px 10px;display:flex;gap:10px;align-items:center;font-size:12px;flex-wrap:wrap}
  .num{font-weight:600}
  .provider{color:#4af}
  .attempts{color:#888}
  .hd{margin-left:auto;color:#4af;text-decoration:none}
  .hd:hover{text-decoration:underline}
  .audio{padding:0 10px 8px;display:flex;flex-direction:column;gap:4px}
  .audio-row{display:flex;align-items:center;gap:8px}
  .lang-tag{display:inline-block;padding:2px 7px;background:#444;border-radius:4px;font-size:10px;color:#bbb;text-transform:uppercase;flex-shrink:0}
  .lang-tag.learning{background:#1a3a4a;color:#7ce}
  .audio audio{flex:1;height:30px}
  .text{padding:6px 10px;font-size:12px;color:#ccc;line-height:1.5;max-height:80px;overflow-y:auto}
  .text.learning{color:#7ce;border-top:1px solid #333}
</style></head><body>
<a class="back" href="/debug/gallery">← Back to gallery</a>
<h1>${escapeHtml(story.title || '(untitled)')}</h1>
<p class="sub">
  ${escapeHtml(story.id)} ·
  ${escapeHtml(new Date(story.createdAt).toLocaleString())} ·
  ${escapeHtml(story.status)} (${escapeHtml(story.stage)}) ·
  $${cost} ·
  ${escapeHtml(primaryLang)}${learningLang ? ' / ' + escapeHtml(learningLang) : ''}
</p>
<div class="grid">${pageBlocks}</div>
</body></html>`;
}
