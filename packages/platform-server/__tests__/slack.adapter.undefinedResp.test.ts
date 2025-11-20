import { describe, it, expect, vi } from 'vitest';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { LoggerService } from '../src/core/services/logger.service';

vi.mock('@slack/web-api', () => {
  class MockClient {
    chat = {
      postMessage: vi.fn(async () => undefined),
    };
  }

  return { WebClient: MockClient };
});

describe('SlackAdapter', () => {
  it('returns unknown_error when Slack API responds with undefined', async () => {
    const adapter = new SlackAdapter(new LoggerService());
    const result = await adapter.sendText({ token: 'xoxb-token', channel: 'C1', text: 'hello' });

    expect(result).toEqual({ ok: false, error: 'unknown_error' });
  });
});
