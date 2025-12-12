import { describe, expect, it } from 'vitest';
import type { RunTimelineEvent } from '@/api/types/agents';
import { computeNewTailCount } from '../llmNewTailCount';

const baseLlmEvent = (overrides: Partial<RunTimelineEvent> = {}): RunTimelineEvent => {
  const { llmCall, ...rest } = overrides;
  return {
    id: 'event-llm',
    runId: 'run-1',
    threadId: 'thread-1',
    type: 'llm_call',
    status: 'success',
    ts: '2024-01-01T00:00:00.000Z',
    startedAt: null,
    endedAt: null,
    durationMs: null,
    nodeId: null,
    sourceKind: 'internal',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    toolExecution: undefined,
    summarization: undefined,
    injection: undefined,
    message: undefined,
    attachments: [],
    llmCall: {
      provider: 'openai',
      model: 'gpt',
      temperature: null,
      topP: null,
      stopReason: null,
      contextItemIds: ['ctx-1'],
      newContextItemCount: 1,
      responseText: null,
      rawResponse: null,
      toolCalls: [],
      usage: undefined,
      ...llmCall,
    },
    ...rest,
  } satisfies RunTimelineEvent;
};

const makeEvent = (type: RunTimelineEvent['type'], id: string): RunTimelineEvent => ({
  id,
  runId: 'run-1',
  threadId: 'thread-1',
  type,
  status: 'success',
  ts: '2024-01-01T00:00:00.000Z',
  startedAt: null,
  endedAt: null,
  durationMs: null,
  nodeId: null,
  sourceKind: 'internal',
  sourceSpanId: null,
  metadata: {},
  errorCode: null,
  errorMessage: null,
  toolExecution: undefined,
  summarization: undefined,
  injection: undefined,
  message: undefined,
  attachments: [],
  llmCall: undefined,
});

describe('computeNewTailCount', () => {
  it('returns total context length when there is no previous LLM event', () => {
    const current = baseLlmEvent({
      llmCall: {
        contextItemIds: ['ctx-1', 'ctx-2', 'ctx-3'],
      },
    });

    expect(computeNewTailCount(undefined, current, [])).toBe(3);
  });

  it('falls back to infinity when context ids are missing', () => {
    const current = baseLlmEvent({
      llmCall: {
        contextItemIds: undefined as unknown as string[],
      },
    });

    expect(computeNewTailCount(undefined, current, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it('counts the current LLM response plus qualifying intermediate events', () => {
    const previous = baseLlmEvent({ id: 'event-llm-prev' });
    const current = baseLlmEvent({ id: 'event-llm-next', llmCall: { contextItemIds: ['ctx-1', 'ctx-2', 'ctx-3', 'ctx-4'] } });

    const between: RunTimelineEvent[] = [
      makeEvent('invocation_message', 'invocation-1'),
      makeEvent('summarization', 'summary-1'),
      makeEvent('tool_execution', 'tool-1'),
      makeEvent('injection', 'injection-1'),
    ];

    expect(computeNewTailCount(previous, current, between)).toBe(4);
  });

  it('returns one when no qualifying events occurred between LLM calls', () => {
    const previous = baseLlmEvent({ id: 'event-llm-prev' });
    const current = baseLlmEvent({ id: 'event-llm-next' });

    const between: RunTimelineEvent[] = [makeEvent('summarization', 'summary-1')];

    expect(computeNewTailCount(previous, current, between)).toBe(1);
  });
});
