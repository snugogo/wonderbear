/**
 * 封装 localStorage,统一处理 JSON 序列化和异常
 * (H5 场景下 localStorage 偶尔会因为隐私模式抛异常,做个兜底)
 */

export const storage = {
  get<T = unknown>(key: string, defaultValue: T | null = null): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      // 兼容字符串值(有些场景不想包 JSON)
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch {
      return defaultValue;
    }
  },

  set(key: string, value: unknown): void {
    try {
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, v);
    } catch {
      // 忽略:隐私模式或配额满
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },

  clear(): void {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  },
};
