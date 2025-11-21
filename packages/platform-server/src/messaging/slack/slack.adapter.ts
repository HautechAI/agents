import { Injectable } from '@nestjs/common';
import { WebClient, type ChatPostMessageResponse, ErrorCode } from '@slack/web-api';
import type { SendResult } from '../types';
import { LoggerService } from '../../core/services/logger.service';

const isChatPostMessageResponse = (value: unknown): value is ChatPostMessageResponse => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { ok?: unknown };
  return typeof candidate.ok === 'boolean';
};

const getSlackErrorCode = (value: unknown): ErrorCode | null => {
  if (!value || typeof value !== 'object') return null;
  const code = (value as { code?: unknown }).code;
  if (code === ErrorCode.PlatformError) return ErrorCode.PlatformError;
  if (code === ErrorCode.HTTPError) return ErrorCode.HTTPError;
  if (code === ErrorCode.RequestError) return ErrorCode.RequestError;
  if (code === ErrorCode.RateLimitedError) return ErrorCode.RateLimitedError;
  return null;
};

@Injectable()
export class SlackAdapter {
  constructor(private readonly logger: LoggerService) {}

  async sendText(input: { token: string; channel: string; text: string; thread_ts?: string }): Promise<SendResult> {
    const { token, channel, text, thread_ts } = input;

    this.logger.info('SlackAdapter.sendText', {
      channel,
      thread_ts,
    });

    const client = new WebClient(token, { logLevel: undefined });
    try {
      const rawResp = await client.chat.postMessage({
        channel,
        text,
        ...(thread_ts ? { thread_ts } : {}),
      });
      if (!isChatPostMessageResponse(rawResp)) {
        this.logger.error('SlackAdapter.sendText invalid response', { channel, thread_ts, response: rawResp });
        return { ok: false, error: 'slack_api_invalid_response' };
      }
      const resp: ChatPostMessageResponse = rawResp;
      if (!resp.ok) {
        const errorOut = typeof resp.error === 'string' && resp.error ? resp.error : 'unknown_error';
        return { ok: false, error: errorOut };
      }
      const ts: string | undefined = typeof resp.ts === 'string' ? resp.ts : undefined;
      // Stakeholder constraint: derive thread id deterministically without duck typing.
      // Only use known typed fields: request thread_ts and response ts.
      const threadIdOut = thread_ts ?? ts ?? null;
      return { ok: true, channelMessageId: ts ?? null, threadId: threadIdOut };
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error('SlackAdapter.sendText failed', e, { channel, thread_ts });
      } else {
        this.logger.error('SlackAdapter.sendText failed', { channel, thread_ts, error: e });
      }
      return this.mapError(e);
    }
  }

  private mapError(error: unknown): SendResult {
    const code = getSlackErrorCode(error);
    if (code === ErrorCode.PlatformError) {
      const data = (error as { data?: { error?: unknown } }).data;
      const errString = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : 'platform_error';
      return { ok: false, error: errString };
    }
    if (code === ErrorCode.RequestError) {
      return { ok: false, error: 'network_error' };
    }
    if (code === ErrorCode.HTTPError) {
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      const status = typeof statusCode === 'number' ? statusCode : null;
      return { ok: false, error: status ? `http_error_${status}` : 'http_error_unknown' };
    }
    if (code === ErrorCode.RateLimitedError) {
      return { ok: false, error: 'rate_limited' };
    }
    if (error instanceof Error && error.message) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: 'unknown_error' };
  }
}
