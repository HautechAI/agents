import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GraphScreen from '../GraphScreen';

vi.mock('@/components/GraphCanvas', () => ({
  GraphCanvas: (props: any) => <div data-testid="graph-canvas" {...props} />,
}));

const useTemplatesMock = vi.fn();

vi.mock('@/lib/graph/hooks', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/graph/hooks');
  return {
    ...actual,
    useTemplates: () => useTemplatesMock(),
  };
});

const baseNodes = [
  { id: 'node-1', kind: 'Trigger', title: 'Trigger', x: 0, y: 0, status: 'ready' as const },
];

describe('GraphScreen', () => {
  beforeEach(() => {
    useTemplatesMock.mockReset();
  });

  it('shows loading state when templates are fetching', () => {
    useTemplatesMock.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<GraphScreen nodes={baseNodes} />);

    expect(screen.getByText('Loading templates…')).toBeInTheDocument();
  });

  it('renders API templates in the empty sidebar', () => {
    useTemplatesMock.mockReturnValue({
      data: [
        { name: 'agent-basic', title: 'Agent Starter', kind: 'agent', sourcePorts: [], targetPorts: [] },
        { name: 'trigger-http', title: 'HTTP Trigger', kind: 'trigger', sourcePorts: [], targetPorts: [] },
      ],
      isLoading: false,
      error: null,
    });

    render(<GraphScreen nodes={baseNodes} />);

    expect(screen.getByText('Agent Starter')).toBeInTheDocument();
    expect(screen.getByText('HTTP Trigger')).toBeInTheDocument();
    const badge = screen.getAllByText('Agent')[0];
    expect(badge).toBeInTheDocument();
  });

  it('displays error message and disables drag when templates fail to load', () => {
    useTemplatesMock.mockReturnValue({
      data: [
        { name: 'agent-basic', title: 'Agent Starter', kind: 'agent', sourcePorts: [], targetPorts: [] },
      ],
      isLoading: false,
      error: new Error('boom'),
    });
    render(<GraphScreen nodes={baseNodes} />);

    expect(screen.getByText('boom')).toBeInTheDocument();
    const agentRow = screen.getByText('Agent Starter').closest('[draggable]') as HTMLElement;
    expect(agentRow).toHaveAttribute('draggable', 'false');
  });
});
