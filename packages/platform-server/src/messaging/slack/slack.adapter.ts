import { Injectable } from '@nestjs/common';
import { WebClient, type ChatPostMessageResponse } from '@slack/web-api';
import type { SendResult } from '../types';
import { LoggerService } from '../../core/services/logger.service';

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
      const resp: ChatPostMessageResponse = await client.chat.postMessage({
        channel,
        text,
        ...(thread_ts ? { thread_ts } : {}),
      });
      if (!resp.ok) return { ok: false, error: resp.error || 'unknown_error' };
      const ts: string | null = resp.ts ?? null;
      let thread_ts_out: string | undefined;
      if (resp.message && typeof resp.message === 'object') {
        const m = resp.message as Record<string, unknown>;
        if (typeof m.thread_ts === 'string') thread_ts_out = m.thread_ts;
      }
      const threadIdOut = thread_ts_out ?? thread_ts ?? ts ?? null;
      return { ok: true, channelMessageId: ts, threadId: threadIdOut };
    } catch (e: unknown) {
      let msg = 'unknown_error';
      if (typeof e === 'object' && e !== null && 'message' in e) {
        const mVal = (e as { message?: unknown }).message;
        if (typeof mVal === 'string' && mVal) msg = mVal;
      }
      return { ok: false, error: msg };
    }
  }
}
