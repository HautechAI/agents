import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runs } from '@/api/modules/runs';
import type { ContextItem } from '@/api/types/agents';

type RunEventContextOptions = {
  limit?: number;
};

type RunEventContextState = {
  items: ContextItem[];
  totalCount: number;
  nextBeforeId: string | null;
  isInitialLoading: boolean;
  isFetchingMore: boolean;
  error: unknown;
};

const EMPTY_STATE: RunEventContextState = {
  items: [],
  totalCount: 0,
  nextBeforeId: null,
  isInitialLoading: false,
  isFetchingMore: false,
  error: null,
};

const buildInitialState = (loading: boolean): RunEventContextState => ({
  items: [],
  totalCount: 0,
  nextBeforeId: null,
  isInitialLoading: loading,
  isFetchingMore: false,
  error: null,
});

export type UseRunEventContextResult = {
  items: ContextItem[];
  totalCount: number;
  hasMore: boolean;
  isInitialLoading: boolean;
  isFetchingMore: boolean;
  error: unknown;
  loadOlder: () => Promise<void>;
};

export function useRunEventContext(
  runId: string | undefined,
  eventId: string | undefined,
  options?: RunEventContextOptions,
): UseRunEventContextResult {
  const [state, setState] = useState<RunEventContextState>(() => buildInitialState(Boolean(runId && eventId)));
  const keyRef = useRef<string | null>(runId && eventId ? `${runId}:${eventId}` : null);

  const limit = options?.limit;

  const fetchInitial = useCallback(
    async (currentKey: string, currentRunId: string, currentEventId: string) => {
      const params = typeof limit === 'number' ? { limit } : undefined;

      try {
        const page = await runs.eventContext(currentRunId, currentEventId, params);
        if (keyRef.current !== currentKey) return;
        setState({
          items: page.items,
          totalCount: page.totalCount,
          nextBeforeId: page.nextBeforeId,
          isInitialLoading: false,
          isFetchingMore: false,
          error: null,
        });
      } catch (error) {
        if (keyRef.current !== currentKey) return;
        setState({
          items: [],
          totalCount: 0,
          nextBeforeId: null,
          isInitialLoading: false,
          isFetchingMore: false,
          error,
        });
      }
    },
    [limit],
  );

  useEffect(() => {
    if (!runId || !eventId) {
      keyRef.current = null;
      setState(EMPTY_STATE);
      return;
    }

    const key = `${runId}:${eventId}`;
    keyRef.current = key;
    setState(buildInitialState(true));

    void fetchInitial(key, runId, eventId);
  }, [eventId, fetchInitial, runId]);

  const loadOlder = useCallback(async () => {
    if (!runId || !eventId) return;
    const key = keyRef.current;
    if (!key || key !== `${runId}:${eventId}`) return;

    const beforeId = state.nextBeforeId;
    if (!beforeId || state.isFetchingMore || state.isInitialLoading) return;

    setState((prev) => ({
      ...prev,
      isFetchingMore: true,
      error: null,
    }));

    const params: { beforeId: string; limit?: number } = { beforeId };
    if (typeof limit === 'number') params.limit = limit;

    try {
      const page = await runs.eventContext(runId, eventId, params);
      if (keyRef.current !== key) return;
      setState((prev) => ({
        items: [...page.items, ...prev.items],
        totalCount: Math.max(prev.totalCount, page.totalCount),
        nextBeforeId: page.nextBeforeId,
        isInitialLoading: false,
        isFetchingMore: false,
        error: null,
      }));
    } catch (error) {
      if (keyRef.current !== key) return;
      setState((prev) => ({
        ...prev,
        isFetchingMore: false,
        error,
      }));
      throw error;
    }
  }, [eventId, limit, runId, state.isFetchingMore, state.isInitialLoading, state.nextBeforeId]);

  return useMemo(
    () => ({
      items: state.items,
      totalCount: state.totalCount,
      hasMore: state.nextBeforeId !== null,
      isInitialLoading: state.isInitialLoading,
      isFetchingMore: state.isFetchingMore,
      error: state.error,
      loadOlder,
    }),
    [loadOlder, state.error, state.isFetchingMore, state.isInitialLoading, state.items, state.nextBeforeId, state.totalCount],
  );
}
