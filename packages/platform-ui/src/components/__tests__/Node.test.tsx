import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReactFlowProvider } from '@xyflow/react';

import GraphNode from '../Node';

describe('components/Node', () => {
  it('renders healthy node border without invalid suffix', () => {
    render(
      <ReactFlowProvider>
        <GraphNode
          kind="Agent"
          title="Agent Node"
          inputs={[{ id: 'input', title: 'input' }]}
          outputs={[{ id: 'output', title: 'output' }]}
        />
      </ReactFlowProvider>,
    );

    const card = screen.getByTestId('graph-node-card');
    expect(card.style.border).toBe('1px solid var(--agyn-blue)');
    expect(card.style.border).not.toContain(')40');

    const header = screen.getByText('Agent Node').parentElement?.parentElement?.parentElement as HTMLElement;
    expect(header).toBeTruthy();
    if (!header) {
      throw new Error('Header element not found');
    }
    expect(header.style.borderBottom).toBe('1px solid var(--agyn-blue)');
    expect(header.style.borderBottom).not.toContain(')40');
  });

  it('renders error icon and shows detail tooltip when provisioning fails', async () => {
    const user = userEvent.setup();
    render(
      <ReactFlowProvider>
        <GraphNode
          kind="Agent"
          title="Agent Node"
          status="provisioning_error"
          errorDetail="Provisioning failed due to timeout"
          inputs={[{ id: 'input', title: 'input' }]}
          outputs={[{ id: 'output', title: 'output' }]}
        />
      </ReactFlowProvider>,
    );

    const card = screen.getByTestId('graph-node-card');
    expect(card).toHaveStyle(
      'box-shadow: 0 0 0 2px var(--agyn-status-failed), 0 4px 12px rgba(220, 38, 38, 0.15)',
    );

    const errorButton = screen.getByRole('button', { name: /view node error details/i });
    await user.hover(errorButton);

    const messages = await screen.findAllByText('Provisioning failed due to timeout');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('falls back to generic tooltip text when detail is missing', async () => {
    const user = userEvent.setup();
    render(
      <ReactFlowProvider>
        <GraphNode
          kind="Agent"
          title="Agent Node"
          status="provisioning_error"
          inputs={[{ id: 'input', title: 'input' }]}
          outputs={[{ id: 'output', title: 'output' }]}
        />
      </ReactFlowProvider>,
    );

    const errorButton = screen.getByRole('button', { name: /view node error details/i });
    await user.hover(errorButton);

    const fallbackMessages = await screen.findAllByText(/No additional error details available/i);
    expect(fallbackMessages.length).toBeGreaterThan(0);
  });

  it('treats legacy error status as provisioning failure', async () => {
    const user = userEvent.setup();
    render(
      <ReactFlowProvider>
        <GraphNode
          kind="Agent"
          title="Agent Node"
          status="error"
          errorDetail="Legacy error state"
          inputs={[{ id: 'input', title: 'input' }]}
          outputs={[{ id: 'output', title: 'output' }]}
        />
      </ReactFlowProvider>,
    );

    const card = screen.getByTestId('graph-node-card');
    expect(card).toHaveStyle(
      'box-shadow: 0 0 0 2px var(--agyn-status-failed), 0 4px 12px rgba(220, 38, 38, 0.15)',
    );

    const errorButton = screen.getByRole('button', { name: /view node error details/i });
    await user.hover(errorButton);

    const legacyMessages = await screen.findAllByText('Legacy error state');
    expect(legacyMessages.length).toBeGreaterThan(0);
  });
});
