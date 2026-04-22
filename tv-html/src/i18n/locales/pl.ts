// Polish locale — placeholder. All entries fall back to zh until translator delivers.
// Mark every key with [TODO_pl] so it's visible at runtime which strings still need translation.
import zh from './zh';

function markAll(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string') {
      out[k] = '[TODO_pl] ' + v;
    } else if (v && typeof v === 'object') {
      out[k] = markAll(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default markAll(zh as unknown as Record<string, unknown>);
