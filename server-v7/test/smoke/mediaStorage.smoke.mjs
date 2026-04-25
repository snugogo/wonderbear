// Quick smoke for mediaStorage in mock mode (no network, no R2 creds needed).
process.env.USE_MOCK_AI = '1';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke_test_jwt_secret_at_least_32_bytes_long_abc123';

const { persistImage, persistImageHd, persistAudio, isMockMode } = await import(
  '../../src/services/mediaStorage.js'
);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ok  ${msg}`); passed++; }
  else      { console.log(`  FAIL ${msg}`); failed++; }
}

console.log('mediaStorage smoke (mock mode)\n==============================');

assert(isMockMode() === true, 'isMockMode() === true under USE_MOCK_AI=1');

// persistImage in mock mode passes through
{
  const src = 'https://mock.wonderbear.app/img/abc.webp';
  const r = await persistImage(src, { storyId: 'sty_test', pageNum: 3, provider: 'fal' });
  assert(r.persistedUrl === src, 'persistImage mock: passes URL through');
  assert(r.skipped === true, 'persistImage mock: marks skipped=true');
  assert(r.format === 'webp', 'persistImage mock: format=webp');
}

// persistImageHd in mock mode passes through
{
  const src = 'data:image/png;base64,AAAA';
  const r = await persistImageHd(src, { storyId: 'sty_test', pageNum: 5, provider: 'imagen' });
  assert(r.persistedUrl === src, 'persistImageHd mock: passes dataURL through');
  assert(r.skipped === true, 'persistImageHd mock: marks skipped');
  assert(r.format === 'png', 'persistImageHd mock: format=png');
}

// persistAudio with string source in mock
{
  const src = 'data:audio/mpeg;base64,UUUU';
  const r = await persistAudio(src, { storyId: 'sty_x', pageNum: 1, lang: 'zh', voiceId: 'v_zh' });
  assert(r.persistedUrl === src, 'persistAudio mock string: passes through');
  assert(r.skipped === true, 'persistAudio mock string: skipped');
}

// persistAudio with Buffer source in mock — synthetic URL
{
  const buf = Buffer.from('fake mp3 bytes');
  const r = await persistAudio(buf, { storyId: 'sty_x', pageNum: 7, lang: 'en', voiceId: 'v_en' });
  assert(typeof r.persistedUrl === 'string' && r.persistedUrl.includes('sty_x'), 'persistAudio mock buffer: synthetic URL');
  assert(r.skipped === true, 'persistAudio mock buffer: skipped');
}

// argument validation
{
  let threw = false;
  try {
    await persistImage('https://x', { pageNum: 1 });
  } catch (e) { threw = e.message.includes('storyId'); }
  assert(threw, 'persistImage: throws when storyId missing');
}
{
  let threw = false;
  try {
    await persistAudio('https://x', { storyId: 'a', pageNum: 1 });
  } catch (e) { threw = e.message.includes('lang'); }
  assert(threw, 'persistAudio: throws when lang missing');
}

console.log(`\nPassed: ${passed}\nFailed: ${failed}`);
if (failed > 0) process.exit(1);
