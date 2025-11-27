import { describe, expect, it } from 'vitest';

import type { RunTimelineEvent } from '@/api/types/agents';

import {
  aggregateLlmUsage,
  mapRunSummaryStatusToScreenStatus,
  mapTimelineEventToRunEvent,
  toEventFilter,
  toStatusFilter,
} from '../timelineEventToRunEvent';

function buildEvent(partial: Partial<RunTimelineEvent>): RunTimelineEvent {
  return {
    id: partial.id ?? 'event-1',
    runId: partial.runId ?? 'run-1',
    type: partial.type ?? 'invocation_message',
    status: partial.status ?? 'success',
    ts: partial.ts ?? '2024-01-01T00:00:00.000Z',
    durationMs: partial.durationMs ?? 1000,
    message: partial.message,
    injection: partial.injection,
    summarization: partial.summarization,
    llmCall: partial.llmCall,
    toolExecution: partial.toolExecution,
    actorId: partial.actorId ?? 'actor-1',
  };
}

describe('timelineEventToRunEvent utilities', () => {
  it('maps LLM call events to run events with tokens and cost', () => {
    const event = buildEvent({
      id: 'llm-1',
      type: 'llm_call',
      llmCall: {
        id: 'llm-1',
        model: 'gpt-test',
        responseText: 'Hello',
        usage: {
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 5,
          reasoningTokens: 1,
          totalTokens: 18,
        },
      },
    });

    const runEvent = mapTimelineEventToRunEvent(event);
    expect(runEvent.type).toBe('llm');
    expect(runEvent.data?.tokens).toEqual({ input: 10, cached: 2, output: 5, reasoning: 1, total: 18 });
    expect(runEvent.data?.cost).toBe('$0');
  });

  it('treats injections as message events with intermediate subtype', () => {
    const event = buildEvent({
      id: 'injection-1',
      type: 'injection',
      status: 'running',
      injection: { reason: 'manual override' },
    });

    const runEvent = mapTimelineEventToRunEvent(event);
    expect(runEvent.type).toBe('message');
    expect(runEvent.status).toBe('running');
    expect(runEvent.data).toMatchObject({ messageSubtype: 'intermediate', content: 'manual override' });
  });

  it('aggregates LLM usage totals across events', () => {
    const events: RunTimelineEvent[] = [
      buildEvent({
        id: 'llm-one',
        type: 'llm_call',
        llmCall: {
          id: 'llm-one',
          model: 'gpt',
          responseText: 'hi',
          usage: { inputTokens: 4, cachedInputTokens: 1, outputTokens: 2, reasoningTokens: 0, totalTokens: 7 },
        },
      }),
      buildEvent({ id: 'msg', type: 'invocation_message' }),
      buildEvent({
        id: 'llm-two',
        type: 'llm_call',
        llmCall: {
          id: 'llm-two',
          model: 'gpt',
          responseText: 'bye',
          usage: { inputTokens: 3, cachedInputTokens: 0, outputTokens: 4, reasoningTokens: 2, totalTokens: 9 },
        },
      }),
    ];

    const aggregated = aggregateLlmUsage(events);
    expect(aggregated).toEqual({ input: 7, cached: 1, output: 6, reasoning: 2, total: 16 });
  });

  it('maps event and status filters consistently', () => {
    expect(toEventFilter(buildEvent({ type: 'summarization' }))).toBe('summary');
    expect(toStatusFilter('cancelled')).toBe('terminated');
  });

  it('maps summary status to UI status', () => {
    expect(mapRunSummaryStatusToScreenStatus('running')).toBe('running');
    expect(mapRunSummaryStatusToScreenStatus('finished')).toBe('finished');
    expect(mapRunSummaryStatusToScreenStatus(undefined)).toBe('pending');
  });
});
