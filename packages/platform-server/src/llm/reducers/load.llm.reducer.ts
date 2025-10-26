import { Reducer } from '@agyn/llm';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ConversationStateRepository } from '../repositories/conversationState.repository';
import type { LLMContext, LLMState } from '../types';

import { LoggerService } from '../../core/services/logger.service';
import { deserializeState, isPlainLLMState } from '../utils/serialization';

@Injectable()
export class LoadLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(PrismaService) private prismaService: PrismaService,
  ) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    try {
      const prisma = this.prismaService.getClient();
      if (!prisma) return state; // persistence disabled
      const repo = new ConversationStateRepository(prisma);
      const nodeId = ctx.callerAgent.getAgentNodeId?.() || 'agent';
      const existing = await repo.get(ctx.threadId, nodeId);
      if (!existing?.state) return state;
      // Merge: existing.messages + incoming messages; keep latest summary
      if (!isPlainLLMState(existing.state)) return state;
      const persisted = deserializeState(existing.state);

      const merged: LLMState = {
        summary: persisted.summary,
        messages: [...persisted.messages, ...state.messages],
      };
      return merged;
    } catch (e) {
      this.logger.error('LoadLLMReducer error: %s', (e as Error)?.message || String(e));
      return state;
    }
  }
}
