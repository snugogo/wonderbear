// Romanian locale — placeholder. All entries fall back to zh until translator delivers.
import zh from './zh';

function markAll(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string') {
      out[k] = '[TODO_ro] ' + v;
    } else if (v && typeof v === 'object') {
      out[k] = markAll(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// WO-3.12: Romanian-translated overrides ride on top of the [TODO_ro]
// placeholders so kid-facing strings introduced in this WO read natively.
const overrides: Record<string, Record<string, string>> = {
  story: {
    createdBy: 'Creat de {name}',
  },
};

const base = markAll(zh as unknown as Record<string, unknown>);
for (const ns of Object.keys(overrides)) {
  const target = (base[ns] as Record<string, unknown>) ?? {};
  for (const k of Object.keys(overrides[ns])) {
    target[k] = overrides[ns][k];
  }
  base[ns] = target;
}

export default base;
