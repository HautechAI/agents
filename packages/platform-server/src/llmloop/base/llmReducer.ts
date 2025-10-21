import { LLMLoopContext, LLMLoopState } from './types';

export abstract class LLMReducer {
  abstract invoke(state: LLMLoopState, ctx: LLMLoopContext): Promise<LLMLoopState>;
}
