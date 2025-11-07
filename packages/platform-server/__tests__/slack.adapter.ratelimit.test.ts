import { describe, it, expect, vi } from 'vitest';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { ChannelAdapterDeps, ChannelDescriptor, SendMessageOptions } from '../src/messaging/types';
import type { VaultRef } from '../src/vault/vault.service';

// Mock slack web api: ensure prototype.chat exists for instance calls
vi.mock('@slack/web-api', () => {
  class WebClient {}
  // Provide prototype chat with spies that tests can manipulate
  (WebClient.prototype as unknown as { chat: { postMessage: ReturnType<typeof vi.fn>; postEphemeral: ReturnType<typeof vi.fn> } }).chat = {
    postMessage: vi.fn(async () => ({ ok: true, ts: '2222', message: { thread_ts: '2222' } })),
    postEphemeral: vi.fn(async () => ({ ok: true, message_ts: '2222' })),
  };
  return { WebClient };
});

describe('SlackAdapter rate limit handling', () => {
  const deps: ChannelAdapterDeps = {
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    vault: { getSecret: async (_ref: VaultRef) => 'xoxb-abc' },
    config: { slack: { botToken: { value: 'secret/slack/BOT', source: 'vault' } } },
  };

  it('returns rate_limited on consecutive 429 errors', async () => {
    const { WebClient } = await import('@slack/web-api');
    // Arrange first and second throws with 429
    const errObj = {
      code: 'slack_webapi_platform_error',
      data: { response: { status: 429, headers: { 'retry-after': '1' } } },
    } as Record<string, unknown>;
    const postMessageMock = WebClient.prototype.chat.postMessage as unknown as vi.Mock;
    postMessageMock.mockRejectedValueOnce(errObj);
    postMessageMock.mockRejectedValueOnce(errObj);

    const adapter = new SlackAdapter(deps);
    const descriptor: ChannelDescriptor = { type: 'slack', identifiers: { channelId: 'C1' }, meta: {}, version: 1 };
    const options: SendMessageOptions = { markdown: false };
    const res = await adapter.sendText({ threadId: 't1', text: 'hi', descriptor, options });
    expect(res.ok).toBe(false);
    expect(res.rateLimited).toBe(true);
    expect(res.error).toBe('rate_limited');
  });

  it('succeeds on retry after initial 429', async () => {
    const { WebClient } = await import('@slack/web-api');
    const errObj = {
      code: 'slack_webapi_platform_error',
      data: { response: { status: 429, headers: { 'Retry-After': '1' } } },
    } as Record<string, unknown>;
    const postMessageMock = WebClient.prototype.chat.postMessage as unknown as vi.Mock;
    postMessageMock.mockRejectedValueOnce(errObj);
    postMessageMock.mockResolvedValueOnce({ ok: true, ts: '3333', message: { thread_ts: '3333' } });

    const adapter = new SlackAdapter(deps);
    const descriptor: ChannelDescriptor = { type: 'slack', identifiers: { channelId: 'C1' }, meta: {}, version: 1 };
    const options: SendMessageOptions = { markdown: true };
    const res = await adapter.sendText({ threadId: 't1', text: 'hi', descriptor, options });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('3333');
  });
});
