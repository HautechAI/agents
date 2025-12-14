import type { ContextItemInput } from './context-items.utils';
import type { RunEventsService } from '../../events/run-events.service';
import type { LLMCallContextItemCounter } from './llm-call-context-item-counter';

export type ContextItemAppendEntry = {
  input: ContextItemInput;
  assign?: (id: string) => void;
  countable?: boolean;
};

export async function persistContextItemsWithCounting(params: {
  runEvents: RunEventsService;
  entries: ContextItemAppendEntry[];
  counter?: LLMCallContextItemCounter;
}): Promise<string[]> {
  const { runEvents, entries, counter } = params;
  if (!entries.length) return [];

  const inputs = entries.map((entry) => entry.input);
  const ids = await runEvents.createContextItems(inputs);

  let countableApplied = 0;
  const countedIds: string[] = [];
  ids.forEach((id, index) => {
    const entry = entries[index];
    if (!entry) return;
    if (id && entry.assign) {
      entry.assign(id);
    }
    if (entry.countable && id) {
      countableApplied += 1;
      countedIds.push(id);
    }
  });

  if (countableApplied > 0 && counter) {
    await counter.increment(countableApplied, countedIds);
  }

  return ids;
}
