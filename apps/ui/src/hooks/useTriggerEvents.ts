import { useEffect, useMemo, useState } from 'react';
import { graphSocket, TriggerEvent } from '@/lib/graph/socket';

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useTriggerEvents(nodeId: string) {
  const [items, setItems] = useState<TriggerEvent[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const debouncedThreadId = useDebounced(threadId, 300);

  // initial + updates
  useEffect(() => {
    if (!nodeId) return;
    graphSocket.connect();
    const onInitial = (payload: { nodeId: string; items: TriggerEvent[] }) => {
      if (payload.nodeId !== nodeId) return;
      setItems(payload.items || []);
    };
    const offInitial = graphSocket.onTriggerInitial(onInitial);
    // per-node event listener
    const offEvent = graphSocket.onTriggerEvent(nodeId, (payload) => {
      if (payload.nodeId !== nodeId) return;
      setItems((prev) => [payload.event, ...prev].slice(0, 200));
    });
    graphSocket.emitTriggerInit({ nodeId, threadId: debouncedThreadId });
    return () => {
      offInitial();
      offEvent();
      graphSocket.emitTriggerClose({ nodeId });
    };
  }, [nodeId]);

  // refetch on thread filter change
  useEffect(() => {
    if (!nodeId) return;
    graphSocket.emitTriggerUpdate({ nodeId, threadId: debouncedThreadId });
  }, [nodeId, debouncedThreadId]);

  return useMemo(() => ({ items, threadId, setThreadId }), [items, threadId]);
}
