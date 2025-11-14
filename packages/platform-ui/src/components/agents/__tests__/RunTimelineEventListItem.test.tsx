import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunTimelineEventListItem } from '../RunTimelineEventListItem';
import type { RunTimelineEvent } from '@/api/types/agents';

const baseEvent: RunTimelineEvent = {
  id: 'event-1',
  runId: 'run-1',
  threadId: 'thread-1',
  type: 'tool_execution',
  status: 'success',
  ts: '2024-01-01T00:00:00.000Z',
  startedAt: null,
  endedAt: null,
  durationMs: 1500,
  nodeId: 'node-1',
  sourceKind: 'internal',
  sourceSpanId: null,
  metadata: {},
  errorCode: null,
  errorMessage: null,
  llmCall: undefined,
  toolExecution: {
    toolName: 'Tool',
    toolCallId: null,
    execStatus: 'success',
    input: {},
    output: {},
    errorMessage: null,
    raw: null,
  },
  summarization: undefined,
  injection: undefined,
  message: undefined,
  attachments: [],
};

describe('RunTimelineEventListItem', () => {
  it('renders bullet when duration present', () => {
    render(
      <RunTimelineEventListItem event={baseEvent} selected={false} onSelect={vi.fn()} />,
    );
    const timestamp = new Date(baseEvent.ts).toLocaleTimeString();
    const infoRow = screen.getByText(timestamp).closest('div');
    expect(infoRow?.textContent).toContain('•');
  });

  it('omits bullet when duration missing', () => {
    const eventWithoutDuration: RunTimelineEvent = { ...baseEvent, durationMs: null };
    render(
      <RunTimelineEventListItem event={eventWithoutDuration} selected={false} onSelect={vi.fn()} />,
    );
    const timestamp = new Date(eventWithoutDuration.ts).toLocaleTimeString();
    const infoRow = screen.getByText(timestamp).closest('div');
    expect(infoRow?.textContent).toBe(timestamp);
  });
});
