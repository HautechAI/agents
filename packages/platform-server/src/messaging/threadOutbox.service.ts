import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { AGENTS_PERSISTENCE_WRITER } from '../agents/tokens';
import { ChannelRouter } from './channelRouter.service';
import type { SendResult, ThreadOutboxSendRequest } from './types';

@Injectable()
export class ThreadOutboxService {
  private readonly logger = new Logger(ThreadOutboxService.name);

  constructor(
    @Inject(AGENTS_PERSISTENCE_WRITER)
    private readonly persistence: Pick<AgentsPersistenceService, 'recordOutboxMessage'>,
    @Inject(ChannelRouter) private readonly channelRouter: ChannelRouter,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  async send(request: ThreadOutboxSendRequest & { role?: 'assistant' | 'user' }): Promise<SendResult> {
    const { threadId, source } = request;
    const text = request.text?.trim() ?? '';
    if (!text) {
      return { ok: false, error: 'empty_message' } satisfies SendResult;
    }

    const role = request.role ?? 'assistant';
    const runId = request.runId ?? null;

    try {
      await this.persistence.recordOutboxMessage({
        threadId,
        text,
        role,
        source,
        runId,
      });
    } catch (error) {
      this.logger.error(
        `ThreadOutboxService: persistence failed${this.format({
          threadId,
          source,
          runId,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { error },
        })}`,
      );
      return {
        ok: false,
        error: error instanceof Error && error.message ? error.message : 'outbox_persistence_failed',
      } satisfies SendResult;
    }

    const adapter = await this.channelRouter.getAdapter(threadId);
    if (!adapter) {
      this.logger.warn(`ThreadOutboxService: missing channel adapter${this.format({ threadId, source })}`);
      return { ok: false, error: 'missing_channel_adapter' } satisfies SendResult;
    }

    return adapter.sendText({
      threadId,
      text,
      source,
      prefix: request.prefix,
      runId,
    });
  }
}
