import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
import type { SendResult } from '../src/messaging/types';

class StubTrigger {
  constructor(private readonly result: SendResult) {}
  async sendToThread(): Promise<SendResult> {
    return this.result;
  }
}

describe('SendMessageFunctionTool context enforcement', () => {
  it('returns missing_thread_context when ctx.threadId is absent', async () => {
    const tool = new SendMessageFunctionTool(new LoggerService(), new StubTrigger({ ok: true }) as any);

    const result = await tool.execute({ message: 'hello' }, {} as any);
    const payload = JSON.parse(result);

    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('missing_thread_context');
  });
});
