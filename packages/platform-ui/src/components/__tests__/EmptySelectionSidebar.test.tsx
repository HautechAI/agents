import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EmptySelectionSidebar, { type DraggableNodeItem } from '../EmptySelectionSidebar';

function makeItems(): DraggableNodeItem[] {
  return [
    { id: 'trigger-http', kind: 'Trigger', title: 'HTTP Trigger' },
    { id: 'agent-basic', kind: 'Agent', title: 'Agent Basic', description: 'An agent' },
  ];
}

describe('EmptySelectionSidebar', () => {
  it('renders provided node items and marks them draggable', () => {
    render(<EmptySelectionSidebar nodeItems={makeItems()} />);

    expect(screen.getByText('Drag to Canvas')).toBeInTheDocument();
    const triggerRow = screen.getByText('HTTP Trigger').closest('[draggable="true"]') as HTMLElement;
    expect(triggerRow).toBeTruthy();
    expect(triggerRow).toHaveAttribute('draggable', 'true');
    expect(screen.getByText('Agent Basic')).toBeInTheDocument();
  });

  it('shows loading state when fetching templates', () => {
    render(<EmptySelectionSidebar isLoading nodeItems={[]} />);

    expect(screen.getByText('Loading templates…')).toBeInTheDocument();
    expect(screen.queryByText('Drag to Canvas')).not.toBeInTheDocument();
  });

  it('shows error message and disables dragging', () => {
    render(
      <EmptySelectionSidebar
        nodeItems={makeItems()}
        errorMessage="Failed to load templates"
      />,
    );

    expect(screen.getByText('Failed to load templates')).toBeInTheDocument();
    const triggerRow = screen.getByText('HTTP Trigger').closest('[draggable]') as HTMLElement;
    const agentRow = screen.getByText('Agent Basic').closest('[draggable]') as HTMLElement;
    expect(triggerRow).toHaveAttribute('draggable', 'false');
    expect(agentRow).toHaveAttribute('draggable', 'false');
  });

  it('shows empty state message when no templates available', () => {
    render(<EmptySelectionSidebar nodeItems={[]} />);

    expect(screen.getByText('No templates available')).toBeInTheDocument();
  });
});
