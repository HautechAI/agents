import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { LoggerService } from '../src/core/services/logger.service';

vi.mock('@slack/web-api', () => {
  let last: any = null;
  class WebClient {
    constructor(token: string) {
      last = { token };
    }
    chat = {
      postMessage: async (opts: any) => ({ ok: true, channel: opts.channel, ts: '1729', message: { thread_ts: opts.thread_ts || '1729' } }),
    };
  }
  return { WebClient, __getLastWebClient: () => last };
});

describe('SlackAdapter', () => {
  const adapter = new SlackAdapter(new LoggerService());
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it('sends message successfully', async () => {
    const res = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('1729');
  });
});
