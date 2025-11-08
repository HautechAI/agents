import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../../core/services/logger.service';
import { VaultService } from '../../../../vault/vault.service';
import { PrismaService } from '../../../../core/services/prisma.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ChannelAdapterRegistry } from '../../../../messaging/registry';
import { ChannelDescriptorSchema, type SendResult } from '../../../../messaging/types';
import type { LLMContext } from '../../../../llm/types';

export const sendMessageInvocationSchema = z
  .object({
    text: z.string().min(1).describe("Message text."),
    markdown: z.boolean().optional().describe('Render as markdown when supported.'),
    broadcast: z.boolean().optional().describe('Broadcast to channel where supported.'),
    correlationId: z.string().min(1).optional().describe('Idempotency key to avoid duplicate sends.'),
    attachments: z
      .array(z.object({ type: z.enum(['file', 'link']), url: z.string().optional(), name: z.string().optional() }))
      .optional(),
  })
  .strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  // Simple in-process idempotency guard for correlationId values.
  private static recentKeys: Map<string, number> = new Map();
  private static readonly IDEMPOTENCY_TTL_MS = 10 * 60_000;
  private static sweepNow(): void {
    const now = Date.now();
    for (const [k, ts] of this.recentKeys) {
      if (now - ts > this.IDEMPOTENCY_TTL_MS) this.recentKeys.delete(k);
    }
  }
  constructor(
    private logger: LoggerService,
    private vault: VaultService,
    private prismaService: PrismaService,
    private config: ConfigService,
  ) {
    super();
  }

  get name() {
    return 'send_message';
  }
  get description() {
    return "Send a message to the thread's origin channel.";
  }
  get schema() {
    return sendMessageInvocationSchema;
  }

  async execute(args: z.infer<typeof sendMessageInvocationSchema>, ctx: LLMContext): Promise<string> {
    const threadId = ctx?.threadId;
    if (!threadId) return JSON.stringify({ ok: false, error: 'missing_thread_context' });
    // Idempotency check
    if (args.correlationId) {
      SendMessageFunctionTool.sweepNow();
      const seen = SendMessageFunctionTool.recentKeys.has(args.correlationId);
      if (seen) return JSON.stringify({ ok: false, error: 'duplicate_correlation_id' });
      SendMessageFunctionTool.recentKeys.set(args.correlationId, Date.now());
    }
    const prisma = this.prismaService.getClient();
    const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { channel: true, channelVersion: true } });
    if (!thread || !thread.channel) {
      this.logger.error('SendMessage: missing descriptor for thread', { threadId });
      return JSON.stringify({ ok: false, error: 'missing_channel_descriptor' });
    }
    const parsed = ChannelDescriptorSchema.safeParse(thread.channel);
    if (!parsed.success) {
      this.logger.error('SendMessage: invalid descriptor', { threadId });
      return JSON.stringify({ ok: false, error: 'invalid_channel_descriptor' });
    }
    const descriptor = parsed.data;
    const adapterLogger = {
      info: (...args: unknown[]) => this.logger.info('send_message', args),
      error: (...args: unknown[]) => this.logger.error('send_message', args),
      debug: (...args: unknown[]) => this.logger.debug?.('send_message', args),
    };
    try {
      const adapter = ChannelAdapterRegistry.getAdapter(descriptor, {
        logger: adapterLogger,
        vault: { getSecret: (ref) => this.vault.getSecret(ref) },
        config: { slack: this.config.slack },
      });
      this.logger.info('SendMessage: adapter selected', { type: descriptor.type, threadId });
      const res: SendResult = await adapter.sendText({ threadId, text: args.text, descriptor, options: { correlationId: args.correlationId, markdown: !!args.markdown, broadcast: !!args.broadcast, attachments: args.attachments } });
      return JSON.stringify(res);
    } catch (e) {
      if (args.correlationId) SendMessageFunctionTool.recentKeys.delete(args.correlationId);
      let msg = 'unknown_error';
      if (typeof e === 'object' && e !== null && 'message' in e) {
        const mVal = (e as { message?: unknown }).message;
        if (typeof mVal === 'string' && mVal) msg = mVal;
      }
      this.logger.error('SendMessage: adapter failed', { threadId, error: msg });
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
