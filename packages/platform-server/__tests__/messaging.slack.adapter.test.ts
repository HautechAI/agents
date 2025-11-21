import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { LoggerService } from '../src/core/services/logger.service';
import { ErrorCode } from '@slack/web-api';

const postMessageMock = vi.fn();
let lastToken: string | null = null;

vi.mock('@slack/web-api', async () => {
  const actual = await vi.importActual<typeof import('@slack/web-api')>('@slack/web-api');
  class WebClient {
    constructor(token: string) {
      lastToken = token;
    }
    chat = {
      postMessage: postMessageMock,
    };
  }
  return { __esModule: true, ...actual, WebClient };
});

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;
  let logger: LoggerService;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    postMessageMock.mockReset();
    lastToken = null;
    logger = new LoggerService();
    adapter = new SlackAdapter(logger);
    errorSpy = vi.spyOn(logger, 'error');
  });

  it('sends message successfully', async () => {
    postMessageMock.mockResolvedValueOnce({ ok: true, ts: '1729', channel: 'C1' });
    const res = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('1729');
    expect(lastToken).toBe('xoxb-abc');
  });

  it('returns slack_api_invalid_response when Web API resolves undefined', async () => {
    postMessageMock.mockResolvedValueOnce(undefined as unknown as Record<string, unknown>);
    const result = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(result).toEqual({ ok: false, error: 'slack_api_invalid_response' });
    expect(errorSpy).toHaveBeenCalledWith('SlackAdapter.sendText invalid response', { channel: 'C1', thread_ts: undefined, response: undefined });
  });

  it('maps PlatformError to slack error string without throwing', async () => {
    const platformError = Object.assign(new Error('An API error occurred: channel_not_found'), {
      code: ErrorCode.PlatformError,
      data: { error: 'channel_not_found' },
    });
    postMessageMock.mockRejectedValueOnce(platformError);
    const result = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(result).toEqual({ ok: false, error: 'channel_not_found' });
    expect(errorSpy).toHaveBeenCalledWith('SlackAdapter.sendText failed', platformError, { channel: 'C1', thread_ts: undefined });
  });

  it('maps RequestError to network_error', async () => {
    const reqError = Object.assign(new Error('ECONNRESET'), {
      code: ErrorCode.RequestError,
    });
    postMessageMock.mockRejectedValueOnce(reqError);
    const result = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(result).toEqual({ ok: false, error: 'network_error' });
    expect(errorSpy).toHaveBeenCalledWith('SlackAdapter.sendText failed', reqError, { channel: 'C1', thread_ts: undefined });
  });

  it('maps HTTPError to http_error_<status>', async () => {
    const httpError = Object.assign(new Error('An HTTP protocol error occurred'), {
      code: ErrorCode.HTTPError,
      statusCode: 500,
    });
    postMessageMock.mockRejectedValueOnce(httpError);
    const result = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(result).toEqual({ ok: false, error: 'http_error_500' });
    expect(errorSpy).toHaveBeenCalledWith('SlackAdapter.sendText failed', httpError, { channel: 'C1', thread_ts: undefined });
  });

  it('maps RateLimitedError to rate_limited', async () => {
    const rateError = Object.assign(new Error('rate limited'), {
      code: ErrorCode.RateLimitedError,
      retryAfter: 25,
    });
    postMessageMock.mockRejectedValueOnce(rateError);
    const result = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(result).toEqual({ ok: false, error: 'rate_limited' });
    expect(errorSpy).toHaveBeenCalledWith('SlackAdapter.sendText failed', rateError, { channel: 'C1', thread_ts: undefined });
  });

  it('falls back to unknown_error for generic errors', async () => {
    const genericError = new Error('boom');
    postMessageMock.mockRejectedValueOnce(genericError);
    const result = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(errorSpy).toHaveBeenCalledWith('SlackAdapter.sendText failed', genericError, { channel: 'C1', thread_ts: undefined });
  });
});
