import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';
import { act, render, waitFor, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from './testUtils';
import { useBuilderState } from '../../src/builder/hooks/useBuilderState';
import type { EdgeChange, NodeChange, OnConnect } from 'reactflow';

function Harness({ expose, debounceMs = 80 }: { expose: (api: ReturnType<typeof useBuilderState>) => void; debounceMs?: number }) {
  const api = useBuilderState('http://localhost:3010', { debounceMs });
  useEffect(() => {
    expose(api);
  }, [api, expose]);
  return <div data-testid="status">{api.loading ? 'loading' : 'ready'}</div>;
}

describe('Builder dirty detection for graph edits', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });
  afterAll(() => server.close());

  function setupServerCounters() {
    const counters = { posts: 0 };
    server.use(
      http.get('http://localhost:3010/api/templates', () =>
        HttpResponse.json([
          { name: 'mock', title: 'Mock', kind: 'tool', sourcePorts: ['out'], targetPorts: ['in'] },
        ]),
      ),
      http.get('http://localhost:3010/api/graph', () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          nodes: [
            { id: 'n1', template: 'mock', config: {}, position: { x: 10, y: 10 } },
            { id: 'n2', template: 'mock', config: {}, position: { x: 100, y: 10 } },
          ],
          edges: [],
        }),
      ),
      http.post('http://localhost:3010/api/graph', async ({ request }) => {
        counters.posts += 1;
        await request.json().catch(() => ({}));
        return HttpResponse.json({ version: Date.now() });
      }),
    );
    return counters;
  }

  it('ignores selection-only changes (no autosave/version bump)', async () => {
    const counters = setupServerCounters();
    let api: ReturnType<typeof useBuilderState> | null = null;

    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // switch to fake timers after hydration only
    vi.useFakeTimers();

    // programmatic selection should not trigger dirty
    const change: NodeChange = { id: 'n1', type: 'select', selected: true };
    api!.onNodesChange([change]);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(counters.posts).toBe(0);
  });

  it('position drag end with no delta is not dirty; real move is dirty', async () => {
    const counters = setupServerCounters();
    let api: ReturnType<typeof useBuilderState> | null = null;

    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    vi.useFakeTimers();

    // Drag end with no delta
    const noMove: NodeChange = { id: 'n1', type: 'position', dragging: false, position: { x: 10, y: 10 } } as any;
    api!.onNodesChange([noMove]);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(counters.posts).toBe(0);

    // Real move
    const move: NodeChange = { id: 'n1', type: 'position', dragging: false, position: { x: 20, y: 10 } } as any;
    api!.onNodesChange([move]);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(counters.posts).toBe(1);
  });

  it('node and edge add/remove mark dirty', async () => {
    const counters = setupServerCounters();
    let api: ReturnType<typeof useBuilderState> | null = null;

    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    vi.useFakeTimers();

    // Node add
    api!.addNode('mock', { x: 0, y: 0 });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(counters.posts).toBe(1);

    // Edge add via valid connection
    const conn: Parameters<OnConnect>[0] = { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' };
    api!.onConnect(conn);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(counters.posts).toBe(2);

    // Edge remove
    const edgeId = 'n1-out__n2-in';
    const erem: EdgeChange = { id: edgeId, type: 'remove' };
    api!.onEdgesChange([erem]);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(counters.posts).toBe(3);

    // Node remove
    const nrem: NodeChange = { id: 'n1', type: 'remove' };
    api!.onNodesChange([nrem]);
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(counters.posts).toBe(4);
  });
});
