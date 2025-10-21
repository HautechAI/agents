import { LLMReducer } from '../base/llmReducer';
import { LLMRouter } from '../base/llmRouter';
import { LLMLoopContext, LLMLoopState } from '../base/types';

export class ConditionalLLMRouter extends LLMRouter {
  constructor(
    private reducer: LLMReducer,
    private next: (state: LLMLoopState, ctx: LLMLoopContext) => string | null,
  ) {
    super();
  }

  async invoke(state: LLMLoopState, ctx: LLMLoopContext) {
    const newState = await this.reducer.invoke(state, ctx);
    return { state: newState, next: this.next(newState, ctx) };
  }
}
