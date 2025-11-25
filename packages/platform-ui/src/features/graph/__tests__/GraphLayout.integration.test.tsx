import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sidebarProps: any[] = [];
const canvasSpy = vi.hoisted(() => vi.fn());

const hookMocks = vi.hoisted(() => ({
  useGraphData: vi.fn(),
  useGraphSocket: vi.fn(),
  useNodeStatus: vi.fn(),
  useNodeState: vi.fn(),
}));

const graphApiMocks = vi.hoisted(() => ({
  postNodeAction: vi.fn(),
  listNodeRuns: vi.fn(),
  terminateRun: vi.fn(),
  terminateThread: vi.fn(),
}));

const notifyMocks = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
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

vi.mock('@/features/graph/hooks/useNodeState', () => ({
  useNodeState: hookMocks.useNodeState,
}));

vi.mock('@/api/modules/graph', () => ({
  graph: graphApiMocks,
}));

vi.mock('@/lib/notify', () => notifyMocks);

import { GraphLayout } from '@/components/agents/GraphLayout';

describe('GraphLayout', () => {
  beforeEach(() => {
    sidebarProps.length = 0;
    Object.values(hookMocks).forEach((mock) => mock.mockReset());
    Object.values(graphApiMocks).forEach((mock) => mock.mockReset());
    Object.values(notifyMocks).forEach((mock) => mock.mockReset());
    canvasSpy.mockReset();
  });

  it('wires node updates, actions, and polling for agent nodes', async () => {
    const updateNode = vi.fn();
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
          state: {},
          runtime: { provisionStatus: { state: 'not_ready' }, isPaused: false },
          capabilities: { provisionable: true },
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
    });
    hookMocks.useGraphSocket.mockImplementation(() => undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: { provisionStatus: { state: 'ready' } } });
    const updateState = vi.fn().mockResolvedValue(undefined);
    hookMocks.useNodeState.mockReturnValue({ state: {}, query: { isPending: false }, updateState });
    graphApiMocks.postNodeAction.mockResolvedValue({ ok: true });
    graphApiMocks.listNodeRuns.mockResolvedValue({ items: [] });
    graphApiMocks.terminateRun.mockResolvedValue({ ok: true });
    graphApiMocks.terminateThread.mockResolvedValue({ ok: true });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { unmount } = render(<GraphLayout />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));
    await waitFor(() => expect(graphApiMocks.listNodeRuns).toHaveBeenCalledWith('node-1', 'all'));

    const sidebar = sidebarProps.at(-1);
    expect(sidebar?.identity?.id).toBe('node-1');

    sidebar?.onTitleChange?.('Updated Agent');
    await waitFor(() =>
      expect(updateNode).toHaveBeenCalledWith('node-1', {
        title: 'Updated Agent',
        config: { title: 'Updated Agent' },
      }),
    );

    await sidebar?.actions?.onProvision?.();
    expect(graphApiMocks.postNodeAction).toHaveBeenCalledWith('node-1', 'provision');
    expect(updateNode).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ status: 'provisioning' }),
    );

    await sidebar?.actions?.onTerminateRun?.('run-1');
    expect(graphApiMocks.terminateRun).toHaveBeenCalledWith('run-1');

    await sidebar?.actions?.onTerminateThread?.('thread-1');
    expect(graphApiMocks.terminateThread).toHaveBeenCalledWith('node-1', 'thread-1');

    confirmSpy.mockRestore();
    unmount();
  });

  it('toggles MCP tools via updateState', async () => {
    const updateNode = vi.fn();
    const updateState = vi.fn().mockResolvedValue(undefined);
    hookMocks.useGraphData.mockReturnValue({
      nodes: [
        {
          id: 'node-mcp',
          template: 'mcp-template',
          kind: 'MCP',
          title: 'MCP Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'MCP Node' },
          state: {},
          runtime: undefined,
          capabilities: { provisionable: false },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'idle', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
    });
    hookMocks.useGraphSocket.mockImplementation(() => undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: undefined });
    hookMocks.useNodeState.mockReturnValue({
      state: { mcp: { tools: [{ name: 'toolA', title: 'Tool A' }], enabledTools: ['toolA'] } },
      query: { isPending: false },
      updateState,
    });
    graphApiMocks.listNodeRuns.mockResolvedValue({ items: [] });

    const { unmount } = render(<GraphLayout />);

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));
    const sidebar = sidebarProps.at(-1);
    expect(sidebar?.tools).toEqual([{ name: 'toolA', title: 'Tool A' }]);

    await sidebar?.onToggleTool?.('toolA', false);
    expect(updateState).toHaveBeenCalledWith({ mcp: { tools: [{ name: 'toolA', title: 'Tool A' }], enabledTools: [] } });

    unmount();
  });
});
