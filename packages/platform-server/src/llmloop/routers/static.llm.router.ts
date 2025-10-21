import { LLMReducer } from '../base/llmReducer';
import { LLMRouter } from '../base/llmRouter';
import { LLMLoopContext, LLMLoopState } from '../base/types';

export class StaticLLMRouter extends LLMRouter {
  constructor(
    private reducer: LLMReducer,
    private next: string,
  ) {
    super();
  }

  async invoke(state: LLMLoopState, ctx: LLMLoopContext) {
    return { state: await this.reducer.invoke(state, ctx), next: this.next };
  }
}
