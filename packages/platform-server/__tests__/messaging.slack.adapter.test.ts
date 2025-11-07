import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';

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
  const deps = { logger: ({ info: () => {}, error: () => {} } as unknown) as import('../src/core/services/logger.service').LoggerService };
  const adapter = new SlackAdapter(deps);
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it('sends message successfully', async () => {
    const res = await adapter.sendText({ token: 'xoxb-abc', threadId: 't1', text: 'hello', descriptor: { type: 'slack', version: 1, identifiers: { channel: 'C1' }, meta: {} } as any });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('1729');
  });
});
