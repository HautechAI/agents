import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const getConfigViewMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/configViews/registry', () => ({
  getConfigView: getConfigViewMock,
}));

import NodePropertiesSidebar from '../NodePropertiesSidebar';

describe('NodePropertiesSidebar', () => {
  beforeEach(() => {
    getConfigViewMock.mockReset();
  });

  it('calls onTitleChange when the title input changes', () => {
    const onTitleChange = vi.fn();
    render(
      <NodePropertiesSidebar
        identity={{ id: 'node-1', title: 'Agent One', template: 'agent', kind: 'Agent' }}
        status={{ status: 'not_ready' }}
        config={{ title: 'Agent One' }}
        onTitleChange={onTitleChange}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated title' } });

    expect(onTitleChange).toHaveBeenCalledWith('Updated title');
  });

  it('renders static config view when provided and forwards onChange', () => {
    const onConfigChange = vi.fn();
    const StaticView = vi.fn(({ onChange }: { onChange: (value: Record<string, unknown>) => void }) => (
      <button type="button" onClick={() => onChange({ foo: 'bar' })}>
        trigger change
      </button>
    ));
    getConfigViewMock.mockReturnValue(StaticView);

    render(
      <NodePropertiesSidebar
        identity={{ id: 'node-1', title: 'Agent One', template: 'agent', kind: 'Agent' }}
        status={{ status: 'not_ready' }}
        config={{ title: 'Agent One' }}
        onConfigChange={onConfigChange}
      />,
    );

    fireEvent.click(screen.getByText('trigger change'));

    expect(onConfigChange).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('renders tools section and toggles tool state via onToggleTool', () => {
    const onToggleTool = vi.fn();
    render(
      <NodePropertiesSidebar
        identity={{ id: 'node-mcp', title: 'MCP Node', template: 'mcp', kind: 'MCP' }}
        status={{ status: 'not_ready' }}
        tools={[{ name: 'toolA', title: 'Tool A', description: 'Example tool' }]}
        enabledTools={['toolA']}
        onToggleTool={onToggleTool}
      />,
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(onToggleTool).toHaveBeenCalledWith('toolA', false);
  });

  it('renders active runs and wires terminate actions', () => {
    const onTerminateRun = vi.fn();
    const onTerminateThread = vi.fn();
    render(
      <NodePropertiesSidebar
        identity={{ id: 'node-agent', title: 'Agent Node', template: 'agent', kind: 'Agent' }}
        status={{ status: 'ready' }}
        runs={[{ runId: 'run-1', threadId: 'thread-1', status: 'running', updatedAt: new Date().toISOString() }]}
        actions={{ onTerminateRun, onTerminateThread, terminatingRunIds: new Set(), terminatingThreadIds: new Set() }}
      />,
    );

    fireEvent.click(screen.getByText('Terminate Run'));
    fireEvent.click(screen.getByText('Terminate Thread'));

    expect(onTerminateRun).toHaveBeenCalledWith('run-1');
    expect(onTerminateThread).toHaveBeenCalledWith('thread-1');
  });
});
