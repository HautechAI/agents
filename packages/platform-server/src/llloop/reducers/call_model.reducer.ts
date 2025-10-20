import { callModel } from '../openai/client.js';
import { withLLM } from '@agyn/tracing';
import type { Reducer, ReduceResult, LoopState, LeanCtx, OpenAIClient } from '../types.js';
import type { Logger } from '../../types/logger.js';

export class CallModelReducer implements Reducer {
  constructor(private readonly openai: OpenAIClient, private readonly logger: Logger) {}
  name(): string {
    return 'call_model';
  }

  async reduce(state: LoopState, ctx: (LeanCtx & { abortSignal?: AbortSignal }) & { tools?: import('../types.js').ToolRegistry }): Promise<ReduceResult> {
    const tools = this.toolsFromRegistry(ctx);
    const res = await withLLM(
      { context: state.messages as any, model: state.model },
      async () => callModel({ client: this.openai, model: state.model, messages: state.messages, tools, signal: ctx.abortSignal }),
    );
    const nextState: LoopState = { ...state, messages: [...state.messages, res.assistant], pendingToolCalls: res.toolCalls };
    return { state: nextState, next: 'route' };
  }

  private toolsFromRegistry(ctx: { tools?: import('../types.js').ToolRegistry } | undefined): Array<{ name: string; description?: string; schema: object }> | undefined {
    const reg = ctx?.tools;
    if (!reg) return undefined;
    try {
      const arr = reg.list();
      if (!arr.length) return undefined;
      return arr.map((t) => ({ name: t.name, description: t.description, schema: t.schema }));
    } catch {
      return undefined;
    }
  }
}
