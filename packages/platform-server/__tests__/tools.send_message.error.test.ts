import { describe, it, expect, vi } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
import type { SendResult } from '../src/messaging/types';
import type { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';

const logger = new LoggerService();

function makeTool(sendToThreadImpl: (threadId: string, text: string) => Promise<SendResult>): SendMessageFunctionTool {
  const trigger = {
    sendToThread: vi.fn(async (threadId: string, text: string) => sendToThreadImpl(threadId, text)),
  } as unknown as SlackTrigger;
  return new SendMessageFunctionTool(logger, trigger);
}

describe('SendMessageFunctionTool error normalization', () => {
  it('returns success envelope on happy path', async () => {
    const tool = makeTool(async () => ({ ok: true, channelMessageId: 'mid', threadId: 'tid' }));
    const res = await tool.execute({ message: 'hello world' }, { threadId: 'thread-1' });
    const payload = JSON.parse(res);
    expect(payload).toEqual({ ok: true, channelMessageId: 'mid', threadId: 'tid' });
  });

  it('passes through adapter error envelope', async () => {
    const tool = makeTool(async () => ({ ok: false, error: 'channel_not_found', details: { scope: 'slack' } }));
    const res = await tool.execute({ message: 'fail' }, { threadId: 'thread-2' });
    const payload = JSON.parse(res);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('channel_not_found');
    expect(payload.details).toEqual({ scope: 'slack' });
  });

  it('normalizes thrown errors into envelope with details', async () => {
    const tool = makeTool(async () => {
      throw new Error('downstream exploded');
    });
    const res = await tool.execute({ message: 'oops' }, { threadId: 'thread-3' });
    const payload = JSON.parse(res);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('downstream exploded');
    expect(payload.details).toMatchObject({ name: 'Error' });
    expect(typeof payload.details.stack).toBe('string');
  });
});
