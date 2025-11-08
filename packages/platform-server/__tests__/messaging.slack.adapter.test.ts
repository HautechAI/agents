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
      postEphemeral: async (opts: any) => ({ ok: true, message_ts: '1730' }),
    };
  }
  return { WebClient, __getLastWebClient: () => last };
});

describe('SlackAdapter', () => {
  const deps = { logger: { info: () => {}, error: () => {} }, vault: { getSecret: async () => 'xoxb-abc' }, config: { slack: { botToken: { value: 'mount/path/key', source: 'vault' } } } };
  const adapter = new SlackAdapter(deps as any);
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it('sends message successfully', async () => {
    const res = await adapter.sendText({ threadId: 't1', text: 'hello', descriptor: { type: 'slack', identifiers: { channelId: 'C1' }, meta: {} } as any });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('1729');
  });
  it('sends ephemeral when user present', async () => {
    const res = await adapter.sendText({ threadId: 't1', text: 'hello', descriptor: { type: 'slack', identifiers: { channelId: 'C1', ephemeralUser: 'U1' }, meta: {} } as any });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('1730');
  });
});

