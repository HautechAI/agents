import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LoggerService } from '../../../../core/services/logger.service';
import { ChannelRegistry } from '../../../../channels/channel.registry';
import { LLMContext } from '../../../../llm/types';

export const SendMessageInvocationSchema = z
  .object({
    text: z.string().min(1).describe('Message text'),
    broadcast: z.boolean().optional().describe('Broadcast thread reply to channel'),
    ephemeral_user: z.union([z.string(), z.null()]).optional().describe('Send ephemeral message to user'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageFunctionTool extends FunctionTool<typeof SendMessageInvocationSchema> {
  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {
    super();
  }

  get name() {
    return 'send_message';
  }
  get description() {
    return 'Send a message via the thread channel (Slack or other).';
  }
  get schema() {
    return SendMessageInvocationSchema;
  }

  async execute(args: z.infer<typeof SendMessageInvocationSchema>, ctx: LLMContext): Promise<string> {
    const threadId = ctx.threadId;
    if (!threadId) throw new Error('send_message requires runtime threadId');
    const res = await this.channels.send(threadId, { text: args.text, broadcast: args.broadcast, ephemeral_user: args.ephemeral_user });
    return JSON.stringify(res);
  }
}

