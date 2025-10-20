import type { Reducer, ReduceResult, LoopState, LoopContext } from '../types.js';

export class SummarizeReducer implements Reducer {
  name(): string {
    return 'summarize';
  }

  async reduce(state: LoopState, ctx: LoopContext, deps: Parameters<Reducer['reduce']>[2]): Promise<ReduceResult> {
    const { summarizer, memory, logger } = deps;
    if (!summarizer) return { state: { ...state, next: 'call_model' }, next: 'call_model' };

    try {
      // Prepend memory summary message if exists
      const working: typeof state.messages = [];
      if (ctx.threadId && memory?.getMemoryMessage) {
        const mem = await memory.getMemoryMessage(ctx.threadId);
        if (mem) working.push(mem);
      }
      working.push(...state.messages);

      const res = await summarizer.summarize(working, { keepTokens: 512, maxTokens: 8192 });
      const out: LoopState = { ...state, messages: res.messages };
      if (res.summary && ctx.threadId && memory?.updateSummary) {
        await memory.updateSummary(ctx.threadId, res.summary);
        out.summary = res.summary;
        // Prepend a compact summary system message for subsequent steps
        out.messages = [{ role: 'system', contentText: `Summary so far: ${res.summary}` }, ...out.messages];
      }
      out.next = 'call_model';
      return { state: out, next: 'call_model' };
    } catch (e) {
      logger.error('summarize reducer failed', e);
      return { state: { ...state, next: 'call_model' }, next: 'call_model' };
    }
  }
}

