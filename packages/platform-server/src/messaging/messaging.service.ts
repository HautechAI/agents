import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '../core/services/logger.service';
import { PrismaService } from '../core/services/prisma.service';
import { VaultService } from '../vault/vault.service';
import { resolveTokenRef } from '../utils/refs';
import { SlackAdapter } from './slack/slack.adapter';
import { ChannelDescriptorSchema, type SendResult } from './types';

@Injectable()
export class MessagingService {
  constructor(
    @Inject(SlackAdapter) private readonly slackAdapter: SlackAdapter,
    @Inject(VaultService) private readonly vault: VaultService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  async sendToThread(threadId: string, text: string): Promise<SendResult> {
    if (!threadId) {
      this.logger.error('MessagingService.sendToThread: missing threadId');
      return { ok: false, error: 'missing_thread_context' };
    }

    try {
      const prisma = this.prismaService.getClient();
      type ThreadChannelRow = { channel: unknown | null };
      const thread = (await prisma.thread.findUnique({
        where: { id: threadId },
        select: { channel: true },
      })) as ThreadChannelRow | null;

      if (!thread || thread.channel == null) {
        this.logger.error('MessagingService.sendToThread: missing descriptor', { threadId });
        return { ok: false, error: 'missing_channel_descriptor' };
      }

      const parsed = ChannelDescriptorSchema.safeParse(thread.channel);
      if (!parsed.success) {
        this.logger.error('MessagingService.sendToThread: invalid descriptor', {
          threadId,
          issues: parsed.error.issues,
        });
        return { ok: false, error: 'invalid_channel_descriptor' };
      }

      const descriptor = parsed.data;
      const ids = descriptor.identifiers;

      const tokenRef = descriptor.meta?.bot_token_ref;
      if (!tokenRef) {
        this.logger.error('MessagingService.sendToThread: missing bot token reference', { threadId });
        return { ok: false, error: 'missing_bot_token_ref' };
      }

      let token: string;
      try {
        token = await resolveTokenRef(tokenRef, {
          expectedPrefix: 'xoxb-',
          fieldName: 'bot_token',
          vault: this.vault,
        });
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : 'invalid_bot_token';
        this.logger.error('MessagingService.sendToThread: bot token resolution failed', {
          threadId,
          error: msg,
        });
        return { ok: false, error: msg };
      }

      const result = await this.slackAdapter.sendText({
        token,
        channel: ids.channel,
        text,
        thread_ts: ids.thread_ts,
      });

      if (!result.ok) {
        this.logger.warn('MessagingService.sendToThread: adapter send failed', {
          threadId,
          error: result.error ?? 'send_failed',
        });
        return { ...result, threadId: result.threadId ?? threadId };
      }

      return { ...result, threadId: result.threadId ?? ids.thread_ts ?? threadId };
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : 'unknown_error';
      this.logger.error('MessagingService.sendToThread: unexpected error', { threadId, error: msg });
      return { ok: false, error: msg };
    }
  }
}
