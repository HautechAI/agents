import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTriggerEvents } from '@/hooks/useTriggerEvents';
import { graphSocket } from '@/lib/graph/socket';

vi.mock('@/lib/graph/socket', () => {
  const listeners: Record<string, Function[]> = {};
  return {
    graphSocket: {
      connect: vi.fn(),
      emitTriggerInit: vi.fn(),
      emitTriggerUpdate: vi.fn(),
      emitTriggerClose: vi.fn(),
      onTriggerInitial: (cb: any) => {
        (listeners['trigger_initial'] ||= []).push(cb);
        return () => {
          listeners['trigger_initial'] = (listeners['trigger_initial'] || []).filter((x) => x !== cb);
        };
      },
      onTriggerEvent: (_nodeId: string, cb: any) => {
        (listeners['trigger_event'] ||= []).push(cb);
        return () => {
          listeners['trigger_event'] = (listeners['trigger_event'] || []).filter((x) => x !== cb);
        };
      },
      __emit: (name: string, payload: any) => {
        for (const cb of listeners[name] || []) cb(payload);
      },
    },
  };
});

describe('useTriggerEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles initial payload, appends updates, and refetches on threadId change', async () => {
    const { result } = renderHook(({ nodeId }) => useTriggerEvents(nodeId), {
      initialProps: { nodeId: 'n1' },
    });

    // initial
    act(() => {
      (graphSocket as any).__emit('trigger_initial', { nodeId: 'n1', items: [
        { ts: 1, threadId: 'a', messages: [{ content: 'm1', info: {} }] },
      ] });
    });
    expect(result.current.items.length).toBe(1);

    // live append
    act(() => {
      (graphSocket as any).__emit('trigger_event', { nodeId: 'n1', event: { ts: 2, threadId: 'a', messages: [{ content: 'm2', info: {} }] } });
    });
    expect(result.current.items[0].messages[0].content).toBe('m2');

    // change threadId
    act(() => {
      result.current.setThreadId('b');
    });

    // simulate initial for new filter
    act(() => {
      (graphSocket as any).__emit('trigger_initial', { nodeId: 'n1', items: [
        { ts: 3, threadId: 'b', messages: [{ content: 'm3', info: {} }] },
      ] });
    });
    expect(result.current.items[0].threadId).toBe('b');
  });
});
