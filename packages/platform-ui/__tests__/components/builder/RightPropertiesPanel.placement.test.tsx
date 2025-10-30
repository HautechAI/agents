import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RightPropertiesPanel } from '@/builder/panels/RightPropertiesPanel';

function makeNode(template: string, id = 'n1') {
  return {
    id,
    type: template,
    position: { x: 0, y: 0 },
    data: { template, name: template, config: {}, state: {} },
    dragHandle: '.drag-handle',
    selected: true,
  } as unknown as import('reactflow').Node<any>;
}

const onChange = vi.fn();

vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    templates: [],
    getTemplate: () => ({ capabilities: { provisionable: true } }),
    loading: false,
    ready: true,
    error: null,
  }),
}));

vi.mock('@/lib/graph/capabilities', async () => {
  const actual = await vi.importActual<typeof import('@/lib/graph/capabilities')>('@/lib/graph/capabilities');
  return {
    ...actual,
    hasStaticConfigByName: () => true,
    hasDynamicConfigByName: () => true,
    canPause: () => false,
    canProvision: () => true,
  };
});

// Avoid requiring QueryClientProvider in this shallow unit test
const statusMock = { provisionStatus: { state: 'not_ready' as const } };
vi.mock('@/lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: statusMock }),
  useNodeAction: () => ({ mutate: () => {} }),
}));

describe('RightPropertiesPanel placement and enablement', () => {
  beforeEach(() => {
    onChange.mockReset();
  });

  it('renders Actions under the Node State section, not under Runtime Status', () => {
    render(<RightPropertiesPanel node={makeNode('t')} onChange={onChange} />);
    const runtimeHeader = screen.getByText('Runtime Status');
    const nodeStateHeader = screen.getByText('Node State');

    // Actions should be within Node State block
    const actionsHeader = screen.getByText('Actions');
    expect(actionsHeader).toBeInTheDocument();
    expect(nodeStateHeader.parentElement?.contains(actionsHeader)).toBe(true);

    // And not inside the Runtime Status block
    expect(runtimeHeader.parentElement?.contains(actionsHeader)).toBe(false);
  });

  it('enables Start on not_ready and disables Stop', () => {
    // statusMock starts as not_ready
    render(<RightPropertiesPanel node={makeNode('t')} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
  });
});

