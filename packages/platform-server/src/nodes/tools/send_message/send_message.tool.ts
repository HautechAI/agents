import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../core/services/logger.service';
import type { LLMContext } from '../../../llm/types';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  constructor(private logger: LoggerService) {
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
    const trigger = ctx?.callerAgent?.getSlackTrigger?.();
    if (!trigger) {
      const error = 'slacktrigger_missing';
      this.logger.error('SendMessageFunctionTool.execute: missing SlackTrigger bridge', { threadId });
      return JSON.stringify({ ok: false, error });
    }
    try {
      const result = await trigger.sendToThread(threadId, args.message);
      if (!result.ok) {
        const error = result.error || 'send_failed';
        this.logger.warn('SendMessageFunctionTool.execute: send failed', { threadId, error });
        return JSON.stringify({ ok: false, error });
      }
      return JSON.stringify({
        ok: true,
        channelMessageId: result.channelMessageId ?? null,
        threadId: result.threadId ?? threadId,
      });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      this.logger.error('SendMessageFunctionTool.execute: unexpected error', { threadId, error: msg });
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
