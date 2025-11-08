import { Injectable } from '@nestjs/common';
import { WebClient, type ChatPostMessageResponse } from '@slack/web-api';
import type { Message as SlackMessage } from '@slack/web-api/dist/response/ChatPostMessageResponse';
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
      const m = resp.message as SlackMessage | undefined;
      const thread_ts_out: string | undefined = m?.thread_ts ?? undefined;
      const threadIdOut = thread_ts_out ?? thread_ts ?? ts ?? null;
      return { ok: true, channelMessageId: ts, threadId: threadIdOut };
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      return { ok: false, error: msg };
    }
  }
}
