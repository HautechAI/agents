import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

const buildLlmEvent = (overrides: Partial<RunEvent> = {}): RunEvent => {
  const defaultContext = [
    {
      id: 'ctx-1',
      role: 'system',
      content: 'System primer',
      timestamp: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'ctx-2',
      role: 'user',
      content: 'Earlier summary',
      timestamp: '2024-01-01T00:01:00.000Z',
    },
    {
      id: 'ctx-3',
      role: 'user',
      content: 'New user prompt',
      timestamp: '2024-01-01T00:02:00.000Z',
    },
    {
      id: 'ctx-4',
      role: 'assistant',
      content: 'Assistant follow-up',
      timestamp: '2024-01-01T00:03:00.000Z',
    },
  ];

  const { data: dataOverrides, ...eventOverrides } = overrides;
  const mergedData = {
    context: defaultContext,
    initialContextCount: defaultContext.length,
    model: 'gpt-window',
    response: 'Assistant follow-up',
    tokens: { total: 42 },
    ...(dataOverrides ?? {}),
  } as RunEvent['data'];

  const contextArray = Array.isArray(mergedData.context) ? mergedData.context : [];
  const initialCountOverride = typeof mergedData.initialContextCount === 'number' ? mergedData.initialContextCount : contextArray.length;
  return {
    id: 'event-llm',
    type: 'llm',
    timestamp: '2024-01-01T00:05:00.000Z',
    duration: '1s',
    status: 'finished',
    data: {
      ...mergedData,
      windowedContext:
        Array.isArray((mergedData as { windowedContext?: unknown }).windowedContext)
          ? (mergedData as { windowedContext?: unknown }).windowedContext
          : contextArray.slice(Math.max(0, contextArray.length - initialCountOverride)),
    },
    ...eventOverrides,
  };
};

describe('RunEventDetails context display', () => {
  it('initially renders only the last N context messages and prepends older ones on demand', () => {
    const event = buildLlmEvent({
      data: {
        initialContextCount: 2,
      },
    });

    render(<RunEventDetails event={event} />);

    const loadButton = screen.getByRole('button', { name: 'Load older context' });
    expect(loadButton).toBeInTheDocument();

    const contextContainer = loadButton.parentElement as HTMLElement;
    expect(contextContainer).toBeTruthy();

    expect(within(contextContainer).queryByText('System primer')).toBeNull();
    expect(within(contextContainer).queryByText('Earlier summary')).toBeNull();
    expect(within(contextContainer).getByText('New user prompt')).toBeInTheDocument();
    expect(within(contextContainer).getByText('Assistant follow-up')).toBeInTheDocument();

    fireEvent.click(loadButton);

    expect(within(contextContainer).getByText('System primer')).toBeInTheDocument();
    expect(within(contextContainer).getByText('Earlier summary')).toBeInTheDocument();
  });

  it('renders assistant tool call toggle when metadata is present', () => {
    const event = buildLlmEvent({
      data: {
        context: [
          {
            id: 'ctx-tool',
            role: 'assistant',
            content: 'Responding with a tool call',
            timestamp: '2024-01-01T00:10:00.000Z',
            additional_kwargs: {
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  name: 'lookup_weather',
                  function: {
                    name: 'lookup_weather',
                    arguments: '{"city":"Paris"}',
                  },
                },
              ],
            },
          },
        ],
        initialContextCount: 1,
      },
    });

    render(<RunEventDetails event={event} />);

    const loadButton = screen.getByRole('button', { name: 'Load older context' });
    const contextContainer = loadButton.parentElement as HTMLElement;

    expect(within(contextContainer).getByText('Responding with a tool call')).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { name: 'lookup_weather' });
    fireEvent.click(toggleButton);

    expect(screen.getByText((content) => content.includes('"city":"Paris"'))).toBeInTheDocument();
  });

  it('renders an empty context window when initialContextCount is zero until older items are loaded', () => {
    const event = buildLlmEvent({
      data: {
        initialContextCount: 0,
      },
    });

    render(<RunEventDetails event={event} />);

    const loadButton = screen.getByRole('button', { name: 'Load older context' });
    const contextContainer = loadButton.parentElement as HTMLElement;

    expect(within(contextContainer).queryByText('System primer')).toBeNull();
    expect(within(contextContainer).queryByText('New user prompt')).toBeNull();

    fireEvent.click(loadButton);

    expect(within(contextContainer).getByText('System primer')).toBeInTheDocument();
    expect(within(contextContainer).getByText('Assistant follow-up')).toBeInTheDocument();
  });
});
