// tools/probe_page1.js — CLI probe for Page 1 image generation chain
// Usage: node tools/probe_page1.js --prompt "A cozy child's bedroom at night"
import { generateCoverImage } from '../src/services/imageGen.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { prompt: null, characterDesc: '' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt') out.prompt = args[++i];
    else if (args[i] === '--character') out.characterDesc = args[++i];
  }
  return out;
}

const { prompt, characterDesc } = parseArgs();
if (!prompt) {
  console.error('Usage: node tools/probe_page1.js --prompt "<prompt>" [--character "<desc>"]');
  process.exit(2);
}

console.log('=== Probe Page 1 ===');
console.log('Input prompt:', prompt);
console.log('Character:   ', characterDesc || '(none)');
console.log('');

const start = Date.now();
try {
  const result = await generateCoverImage({
    imagePrompt: prompt,
    characterDesc,
    seed: `probe-${Date.now()}`,
    onAttempt: (att) => {
      const status = att.success ? 'OK' : 'FAIL';
      const err = att.errorMessage ? ` — ${att.errorMessage.slice(0, 120)}` : '';
      console.log(`  attempt[${att.tier}] ${att.provider} ${status} ${att.durationMs}ms${err}`);
    },
  });
  console.log('');
  console.log('Final provider:', result.provider, 'tier:', result.tier);
  const urlPreview = result.imageUrl.startsWith('data:')
    ? `${result.imageUrl.slice(0, 60)}... (${result.imageUrl.length} chars)`
    : result.imageUrl;
  console.log('imageUrl:', urlPreview);
  console.log('Total time:', Date.now() - start, 'ms');
  process.exit(result.provider === 'placeholder' ? 1 : 0);
} catch (err) {
  console.error('Probe crashed:', err);
  process.exit(3);
}
