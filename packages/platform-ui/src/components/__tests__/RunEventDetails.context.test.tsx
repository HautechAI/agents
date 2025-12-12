import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

describe('RunEventDetails – context badges', () => {
  it('renders new badges for the last N context entries', () => {
    const event: RunEvent = {
      id: 'event-llm-1',
      type: 'llm',
      timestamp: '2024-01-01T00:00:00.000Z',
      data: {
        context: [
          {
            role: 'user',
            content: 'Prompt text',
            timestamp: '2024-01-01T00:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'Interim answer',
            timestamp: '2024-01-01T00:00:01.000Z',
          },
          {
            role: 'assistant',
            content: 'Final answer',
            timestamp: '2024-01-01T00:00:02.000Z',
          },
        ],
        response: 'Final answer',
        model: 'gpt-4o-mini',
        newContextCount: 1,
      },
    };

    render(<RunEventDetails event={event} />);

    const badges = screen.getAllByLabelText('Added since previous LLM call');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('New');

    const assistantHeaders = screen.getAllByText('assistant', { exact: false }).map((node) => node.closest('div'));
    expect(assistantHeaders).toHaveLength(2);
    const [firstAssistant, secondAssistant] = assistantHeaders;

    expect(firstAssistant).not.toBeNull();
    if (firstAssistant) {
      expect(within(firstAssistant).queryByLabelText('Added since previous LLM call')).toBeNull();
    }

    expect(secondAssistant).not.toBeNull();
    if (secondAssistant) {
      expect(within(secondAssistant).getByLabelText('Added since previous LLM call')).toBeInTheDocument();
    }

    const userHeader = screen.getByText('user', { exact: false }).closest('div');
    expect(userHeader).not.toBeNull();
    if (userHeader) {
      expect(within(userHeader).queryByLabelText('Added since previous LLM call')).toBeNull();
    }
  });
});
