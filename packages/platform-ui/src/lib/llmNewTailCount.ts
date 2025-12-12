import type { RunEventType, RunTimelineEvent } from '@/api/types/agents';

const COUNTED_EVENT_TYPES: ReadonlySet<RunEventType> = new Set(['invocation_message', 'tool_execution', 'injection']);

export function computeNewTailCount(
  previousLlmEvent: RunTimelineEvent | undefined,
  currentLlmEvent: RunTimelineEvent,
  eventsBetween: readonly RunTimelineEvent[],
): number {
  if (currentLlmEvent.type !== 'llm_call') {
    return 0;
  }

  if (!previousLlmEvent) {
    const totalIds = currentLlmEvent.llmCall?.contextItemIds;
    return Array.isArray(totalIds) ? totalIds.length : Number.POSITIVE_INFINITY;
  }

  let count = 1;
  for (const event of eventsBetween) {
    if (COUNTED_EVENT_TYPES.has(event.type)) {
      count += 1;
    }
  }
  return count;
}
