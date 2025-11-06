import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LoggerService } from '../../../../core/services/logger.service';
import { AgentsPersistenceService } from '../../../../agents/agents.persistence.service';
import { TriggerMessagingService } from '../../../../channels/trigger.messaging';
import type { ChannelInfo } from '../../../../channels/types';
import { LLMContext } from '../../../../llm/types';

export const SendMessageInvocationSchema = z
  .object({
    message: z.string().min(1).describe('Message text'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageFunctionTool extends FunctionTool<typeof SendMessageInvocationSchema> {
  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(TriggerMessagingService) private readonly triggers: TriggerMessagingService,
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
    const info = (await this.persistence.getThreadChannel(threadId)) as ChannelInfo | null;
    if (!info || !('type' in info)) return JSON.stringify({ ok: false, error: 'channel_info_missing', attempts: 0 });
    if (info.type === 'slack') {
      const triggerNodeId = info.meta?.triggerNodeId;
      if (!triggerNodeId) return JSON.stringify({ ok: false, error: 'invalid_channel_info', attempts: 0 });
      const messenger = this.triggers.resolve('slack', triggerNodeId);
      if (!messenger) return JSON.stringify({ ok: false, error: 'trigger_not_available', attempts: 0 });
      const res = await messenger.send(info, { text: args.message });
      return JSON.stringify(res);
    }
    return JSON.stringify({ ok: false, error: 'unsupported_channel', attempts: 0 });
  }
}
