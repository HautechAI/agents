import type { OpenAIClient, ToolRegistry, LoopState, LeanCtx, Message } from './types.js';
import type { Logger } from '../types/logger.js';
import { invoke as dispatchInvoke } from './dispatcher.js';
import { SummarizeReducer } from './reducers/summarize.reducer.js';
import { CallModelReducer } from './reducers/call_model.reducer.js';
import { ToolsReducer } from './reducers/tools.reducer.js';
import { EnforceReducer } from './reducers/enforce.reducer.js';
import { RouteReducer } from './reducers/route.reducer.js';

export class LLLoop {
  constructor(
    private logger: Logger,
    private deps: { openai: OpenAIClient; tools?: ToolRegistry; summarizer?: import('./types.js').Summarizer; memory?: import('./types.js').MemoryConnector },
  ) {}

  // Compute appended messages from before -> after (replace-only semantics)
  private diffAppended(before: Message[], after: Message[]): Message[] {
    const eq = (a: Message, b: Message): boolean =>
      a.role === b.role &&
      (a.contentText ?? null) === (b.contentText ?? null) &&
      JSON.stringify(a.contentJson ?? null) === JSON.stringify(b.contentJson ?? null) &&
      (a.name ?? null) === (b.name ?? null) &&
      (a.toolCallId ?? null) === (b.toolCallId ?? null);
    let i = 0;
    const max = Math.min(before.length, after.length);
    while (i < max && eq(before[i]!, after[i]!)) i++;
    return after.slice(i);
  }

  async invoke(args: {
    state: LoopState;
    ctx?: { summarizerConfig?: { keepTokens: number; maxTokens: number; note?: string } };
  }): Promise<{ state: LoopState; appended: Message[] }> {
    const ctx: LeanCtx = {
      summarizerConfig: args.ctx?.summarizerConfig,
      memory: this.deps.memory,
    };
    const reducers = [
      new SummarizeReducer(this.logger),
      new CallModelReducer(this.deps.openai, this.logger),
      new ToolsReducer(this.deps.tools, this.logger),
      new EnforceReducer(this.logger),
      new RouteReducer(this.logger),
    ];
    const before = args.state.messages;
    const finalState = await dispatchInvoke({ reducers, state: args.state, ctx, logger: this.logger });
    const appended = this.diffAppended(before, finalState.messages);
    return { state: finalState, appended };
  }
}
