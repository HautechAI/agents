import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunEventDetails, type RunEvent } from '@/components/RunEventDetails';

type ContextRecord = Record<string, unknown> & {
  id: string;
  content: string;
  role?: string;
  __agynIsNew?: boolean;
};

const buildEvent = (context: ContextRecord[]): RunEvent => ({
  id: 'event-1',
  type: 'llm',
  timestamp: '2024-01-01T00:00:00.000Z',
  data: {
    context,
    assistantContext: [],
    response: '',
    toolCalls: [],
  },
});

describe('RunEventDetails context pagination', () => {
  it('renders only new context items initially', () => {
    const event = buildEvent([
      { id: 'ctx-old-1', role: 'user', content: 'Older message 1' },
      { id: 'ctx-new-1', role: 'user', content: 'New message', __agynIsNew: true },
      { id: 'ctx-old-2', role: 'user', content: 'Older message 2' },
    ]);

    render(<RunEventDetails event={event} />);

    expect(screen.getByText('New message')).toBeInTheDocument();
    expect(screen.queryByText('Older message 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Older message 2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('reveals older context items in order when loading more', async () => {
    const event = buildEvent([
      { id: 'ctx-old-1', role: 'user', content: 'Older message 1' },
      { id: 'ctx-new-1', role: 'user', content: 'New message', __agynIsNew: true },
      { id: 'ctx-old-2', role: 'user', content: 'Older message 2' },
    ]);

    render(<RunEventDetails event={event} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByText('Older message 1')).toBeInTheDocument());
    expect(screen.getByText('Older message 2')).toBeInTheDocument();

    const newEntry = screen.getByText('New message');
    const olderFirst = screen.getByText('Older message 1');
    const olderSecond = screen.getByText('Older message 2');

    expect(olderFirst.compareDocumentPosition(newEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newEntry.compareDocumentPosition(olderSecond) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows empty new-context message and loads older items on demand', async () => {
    const event = buildEvent([
      { id: 'ctx-old-1', role: 'user', content: 'Older message 1' },
      { id: 'ctx-old-2', role: 'user', content: 'Older message 2' },
    ]);

    render(<RunEventDetails event={event} />);

    expect(screen.getByText('No new context for this call.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByText('Older message 1')).toBeInTheDocument());
    expect(screen.getByText('Older message 2')).toBeInTheDocument();
    expect(screen.queryByText('No new context for this call.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});
