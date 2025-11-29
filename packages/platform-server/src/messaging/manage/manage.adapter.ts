import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentsPersistenceService } from '../../agents/agents.persistence.service';
import { PrismaService } from '../../core/services/prisma.service';
import type { ThreadOutboxSource } from '../types';

interface ForwardChildMessageParams {
  childThreadId: string;
  text: string;
  source: ThreadOutboxSource;
  runId?: string | null;
  prefix?: string;
}

interface ForwardChildMessageSuccess {
  ok: true;
  parentThreadId: string;
  forwardedText: string;
}

interface ForwardChildMessageFailure {
  ok: false;
  error: string;
}

@Injectable()
export class ManageAdapter {
  private readonly logger = new Logger(ManageAdapter.name);

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private errorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  async forwardChildMessage(params: ForwardChildMessageParams): Promise<ForwardChildMessageSuccess | ForwardChildMessageFailure> {
    const { childThreadId, source, runId = null } = params;
    const text = params.text?.trim() ?? '';
    if (!text) {
      return { ok: false, error: 'empty_message' };
    }

    try {
      const prisma = this.prismaService.getClient();
      const thread = await prisma.thread.findUnique({ where: { id: childThreadId }, select: { parentId: true } });
      const parentThreadId = thread?.parentId ?? null;
      if (!parentThreadId) {
        this.logger.warn(
          `ManageAdapter: missing parent thread${this.format({ childThreadId })}`,
        );
        return { ok: false, error: 'manage_missing_parent' };
      }

      const agentTitleCandidate = await this.persistence.getThreadAgentTitle(childThreadId);
      const trimmedAgentTitle = typeof agentTitleCandidate === 'string' ? agentTitleCandidate.trim() : '';
      const agentTitle = trimmedAgentTitle.length > 0 ? trimmedAgentTitle : 'Subagent';
      const resolvedPrefix = typeof params.prefix === 'string' && params.prefix.length > 0 ? params.prefix : `From ${agentTitle}: `;
      const forwardedText = `${resolvedPrefix}${text}`;

      await this.persistence.recordOutboxMessage({
        threadId: parentThreadId,
        text: forwardedText,
        role: 'assistant',
        source: 'manage_forward',
        runId,
      });

      return { ok: true, parentThreadId, forwardedText };
    } catch (error) {
      this.logger.error(
        `ManageAdapter: forwardChildMessage failed${this.format({
          childThreadId: params.childThreadId,
          source,
          runId,
          error: this.errorInfo(error),
        })}`,
      );
      const message = error instanceof Error && error.message ? error.message : 'manage_forward_failed';
      return { ok: false, error: message };
    }
  }
}
