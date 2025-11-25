import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sidebarProps: any[] = [];
const canvasSpy = vi.hoisted(() => vi.fn());

const hookMocks = vi.hoisted(() => ({
  useGraphData: vi.fn(),
  useGraphSocket: vi.fn(),
  useNodeStatus: vi.fn(),
}));

vi.mock('@/components/GraphCanvas', () => ({
  GraphCanvas: (props: unknown) => {
    canvasSpy(props);
    return <div data-testid="graph-canvas-mock" />;
  },
}));

vi.mock('@/components/NodePropertiesSidebar', () => ({
  __esModule: true,
  default: (props: unknown) => {
    sidebarProps.push(props);
    return <div data-testid="node-sidebar-mock" />;
  },
}));

vi.mock('@/features/graph/hooks/useGraphData', () => ({
  useGraphData: hookMocks.useGraphData,
}));

vi.mock('@/features/graph/hooks/useGraphSocket', () => ({
  useGraphSocket: hookMocks.useGraphSocket,
}));

vi.mock('@/features/graph/hooks/useNodeStatus', () => ({
  useNodeStatus: hookMocks.useNodeStatus,
}));

import { GraphLayout } from '@/components/agents/GraphLayout';

describe('GraphLayout', () => {
  beforeEach(() => {
    sidebarProps.length = 0;
    Object.values(hookMocks).forEach((mock) => mock.mockReset());
    canvasSpy.mockReset();
  });

  it('passes sidebar config/state and persists config updates', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node', systemPrompt: 'You are helpful.' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockImplementation(({ onStatus, onState }) => {
      onStatus?.({
        nodeId: 'node-1',
        updatedAt: new Date().toISOString(),
        provisionStatus: { state: 'ready' },
        isPaused: false,
      } as any);
      onState?.({ nodeId: 'node-1', state: { foo: 'bar' } } as any);
    });

    hookMocks.useNodeStatus.mockReturnValue({ data: { provisionStatus: { state: 'ready' } } });

    const { unmount } = render(<GraphLayout />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));

    expect(hookMocks.useGraphSocket).toHaveBeenCalledWith(
      expect.objectContaining({ nodeIds: ['node-1'] }),
    );

    const sidebar = sidebarProps.at(-1) as {
      config: Record<string, unknown>;
      state: Record<string, unknown>;
      onConfigChange?: (next: Record<string, unknown>) => void;
    };

    expect(Object.keys(sidebar).sort()).toEqual(['config', 'onConfigChange', 'state']);

    expect(sidebar.config).toEqual({
      kind: 'Agent',
      title: 'Agent Node',
      systemPrompt: 'You are helpful.',
    });

    expect(sidebar.state).toEqual({ status: 'ready' });

    sidebar.onConfigChange?.({ title: 'Updated Agent', systemPrompt: 'New prompt' });

    await waitFor(() =>
      expect(updateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          config: expect.objectContaining({
            kind: 'Agent',
            title: 'Updated Agent',
            systemPrompt: 'New prompt',
          }),
          title: 'Updated Agent',
        }),
      ),
    );

    unmount();
  });

  it('persists node position updates when drag ends', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null });

    render(<GraphLayout />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const props = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    expect(props.onNodesChange).toBeDefined();

    act(() => {
      props.onNodesChange?.([
        {
          id: 'node-1',
          type: 'position',
          position: { x: 120, y: 240 },
          dragging: true,
        },
      ]);
    });

    expect(updateNode).not.toHaveBeenCalled();

    act(() => {
      props.onNodesChange?.([
        {
          id: 'node-1',
          type: 'position',
          position: { x: 150, y: 260 },
          dragging: false,
        },
      ]);
    });

    await waitFor(() =>
      expect(updateNode).toHaveBeenCalledWith('node-1', expect.objectContaining({ x: 150, y: 260 })),
    );
  });

  it('persists edges when connecting and removing', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
        {
          id: 'node-2',
          template: 'tool-template',
          kind: 'Tool',
          title: 'Tool Node',
          x: 200,
          y: 200,
          status: 'not_ready',
          config: { title: 'Tool Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null });

    render(<GraphLayout />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const props = canvasSpy.mock.calls.at(-1)?.[0] as {
      onConnect?: (connection: any) => void;
      onEdgesChange?: (changes: any[]) => void;
    };

    act(() => {
      props.onConnect?.({
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'out',
        targetHandle: 'in',
      });
    });

    await waitFor(() =>
      expect(setEdges).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'node-1-out__node-2-in',
          source: 'node-1',
          target: 'node-2',
          sourceHandle: 'out',
          targetHandle: 'in',
        }),
      ]),
    );

    act(() => {
      props.onEdgesChange?.([
        {
          id: 'node-1-out__node-2-in',
          type: 'remove',
        },
      ]);
    });

    await waitFor(() => expect(setEdges).toHaveBeenCalledWith([]));
  });
});
