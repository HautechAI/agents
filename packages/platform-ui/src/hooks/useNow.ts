import { useEffect, useState } from 'react';

const DEFAULT_INTERVAL_MS = 1000;

export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, Math.max(16, intervalMs));

    return () => {
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return now;
}
