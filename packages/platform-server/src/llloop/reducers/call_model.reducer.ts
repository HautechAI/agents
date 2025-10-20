import { callModel } from '../openai/client.js';
import type { Reducer, ReduceResult, LoopState, LoopContext } from '../types.js';

export class CallModelReducer implements Reducer {
  name(): string {
    return 'call_model';
  }

  async reduce(state: LoopState, ctx: LoopContext, deps: Parameters<Reducer['reduce']>[2]): Promise<ReduceResult> {
    const { llm, tools } = deps;
    const toolDefs = tools?.list().map((t) => ({ name: t.name, description: undefined, schema: { type: 'object' } }));
    const res = await callModel({ client: llm, model: state.model, messages: state.messages, tools: toolDefs, signal: ctx.abortSignal });
    const nextState: LoopState = {
      ...state,
      messages: [...state.messages, res.assistant],
      pendingToolCalls: res.toolCalls,
      rawRequest: res.rawRequest,
      rawResponse: res.rawResponse,
    };
    nextState.next = 'route';
    return { state: nextState, next: 'route' };
  }
}
