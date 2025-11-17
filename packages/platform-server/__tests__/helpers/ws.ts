import WebSocket from 'ws';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const waitFor = async (predicate: () => boolean, timeoutMs = 2000, intervalMs = 25): Promise<void> => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('waitFor timeout');
    }
    await delay(intervalMs);
  }
};

export const waitForWsClose = (ws: WebSocket, timeoutMs = 2000): Promise<{ code: number; reason: string }> => {
  return new Promise((resolve, reject) => {
    const internal = ws as WebSocket & { _closeCode?: number; _closeMessage?: Buffer };

    const cleanup = () => {
      clearTimeout(timer);
      if (typeof ws.off === 'function') {
        ws.off('close', onClose);
        ws.off('error', onError);
      } else {
        ws.removeListener?.('close', onClose);
        ws.removeListener?.('error', onError);
      }
    };

    const resolveWith = (code?: number, reasonBuf?: Buffer) => {
      resolve({
        code: typeof code === 'number' ? code : internal._closeCode ?? 1006,
        reason: reasonBuf ? reasonBuf.toString() : internal._closeMessage ? internal._closeMessage.toString() : '',
      });
    };

    const onClose = (code: number, reason: Buffer) => {
      cleanup();
      resolveWith(code, reason);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const timer = setTimeout(() => {
      cleanup();
      resolveWith();
    }, timeoutMs);

    ws.on('close', onClose);
    ws.on('error', onError);

    if (ws.readyState === WebSocket.CLOSED) {
      cleanup();
      resolveWith();
    }
  });
};

