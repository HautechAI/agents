import { LLMRouter } from './base/llmRouter';
import { LLMLoopContext, LLMLoopState } from './base/types';

export class LLMLoop {
  constructor(private routers: Map<string, LLMRouter>) {}

  async invoke(state: LLMLoopState, ctx: LLMLoopContext, params?: { route?: string }) {
    let workingState = state;
    let next: string | null = params?.route ?? 'call_model';
    while (next) {
      const router = this.routers.get(next);
      if (!router) {
        throw new Error(`No router found for key: ${next}`);
      }
      const result = await router.invoke(workingState, ctx);
      workingState = result.state;
      next = result.next;
    }
    return workingState;
  }
}
