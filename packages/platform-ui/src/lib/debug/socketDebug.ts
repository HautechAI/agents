type PayloadFactory = () => unknown;

let cachedFlag: boolean | null = null;

function readEnvFlag(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.VITE_SOCKET_DEBUG === 'string') {
      if (import.meta.env.VITE_SOCKET_DEBUG === 'true') return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function readLocalStorageFlag(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
  try {
    return window.localStorage.getItem('ui.socketDebug') === 'true';
  } catch {
    return false;
  }
}

export function isSocketDebugEnabled(): boolean {
  if (cachedFlag !== null) return cachedFlag;
  const enabled = readEnvFlag() || readLocalStorageFlag();
  cachedFlag = enabled;
  return enabled;
}

export function createSocketLogger(namespace: string) {
  return (message: string, payload?: unknown | PayloadFactory) => {
    if (!isSocketDebugEnabled()) return;
    const value = typeof payload === 'function' ? (payload as PayloadFactory)() : payload;
    if (value === undefined) {
      console.debug(`[${namespace}] ${message}`);
    } else {
      console.debug(`[${namespace}] ${message}`, value);
    }
  };
}

export function resetSocketDebugCacheForTests() {
  cachedFlag = null;
}
