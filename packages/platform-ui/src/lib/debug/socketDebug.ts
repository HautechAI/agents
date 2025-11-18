type PayloadFactory = () => unknown;

export function createSocketLogger(namespace: string) {
  const safeStringify = (value: unknown) => {
    try {
      return JSON.stringify(value, (_key, val) => {
        if (typeof val === 'number' && !Number.isFinite(val)) return String(val);
        return val;
      });
    } catch {
      return String(value);
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return safeStringify(value);
  };

  return (message: string, payload?: unknown | PayloadFactory) => {
    let data: unknown;
    if (typeof payload === 'function') {
      try {
        data = (payload as PayloadFactory)();
      } catch (error) {
        data = error instanceof Error ? { logError: { name: error.name, message: error.message } } : { logError: error };
      }
    } else {
      data = payload;
    }

    const prefix = `${namespace}: ${message}`;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const entries = Object.entries(data as Record<string, unknown>);
      if (entries.length === 0) {
        console.log(prefix);
        return;
      }
      const formatted = entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(' ');
      console.log(`${prefix} ${formatted}`);
    } else if (data !== undefined) {
      console.log(`${prefix} value=${formatValue(data)}`);
    } else {
      console.log(prefix);
    }
  };
}
