import { LLMLoopContext, LLMLoopState } from './types';

export abstract class LLMRouter {
  abstract invoke(state: LLMLoopState, ctx: LLMLoopContext): Promise<{ state: LLMLoopState; next: string | null }>;
}
