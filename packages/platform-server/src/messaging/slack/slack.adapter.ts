import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { parseVaultRef, resolveTokenRef, ReferenceFieldSchema } from '../../utils/refs';
import type { ChannelAdapter, ChannelAdapterDeps, SendMessageOptions, SendResult } from '../types';
import type { ChannelDescriptor } from '../types';
import { z } from 'zod';

const SlackConfigSchema = z.object({
  slack: z.object({ botToken: z.union([z.string().min(1), ReferenceFieldSchema]) }).strict(),
});

type SlackConfig = z.infer<typeof SlackConfigSchema>;

export class SlackAdapter implements ChannelAdapter {
  constructor(private deps: ChannelAdapterDeps) {}

  private async resolveBotToken(): Promise<string> {
    const parsed = SlackConfigSchema.safeParse(this.deps.config);
    if (!parsed.success) throw new Error('Slack configuration missing (slack.botToken)');
    const bot = parsed.data.slack.botToken;
    const ref = typeof bot === 'string' ? { value: bot, source: 'static' as const } : bot;
    if ((ref.source || 'static') === 'vault') parseVaultRef(ref.value);
    const token = await resolveTokenRef(ref, {
      expectedPrefix: 'xoxb-',
      fieldName: 'bot_token',
      vault: this.deps.vault as any,
    });
    return token;
  }

  async sendText(input: { threadId: string; text: string; descriptor: ChannelDescriptor; options?: SendMessageOptions }): Promise<SendResult> {
    const { descriptor, threadId, text } = input;
    const opts = input.options || {};
    const identifiers = descriptor.identifiers as { channelId: string; threadTs?: string | null; ephemeralUser?: string | null };
    const channel = identifiers.channelId;
    const replyTs = opts.replyTo ?? identifiers.threadTs ?? undefined;
    const ephemeralUser = identifiers.ephemeralUser ?? null;

    this.deps.logger.info('SlackAdapter.sendText', {
      type: descriptor.type,
      threadId,
      channelId: channel,
      replyTs,
      correlationId: opts.correlationId,
    });

    const token = await this.resolveBotToken();
    const client = new WebClient(token, { logLevel: undefined });

    const doSend = async (): Promise<SendResult> => {
      try {
        if (ephemeralUser) {
          const resp: ChatPostEphemeralResponse = await client.chat.postEphemeral({
            channel,
            user: ephemeralUser,
            text,
            thread_ts: replyTs,
          });
          if (!resp.ok) return { ok: false, error: resp.error || 'unknown_error' };
          return { ok: true, channelMessageId: resp.message_ts ?? null, threadId: replyTs ?? null };
        }
        const resp: ChatPostMessageResponse = await client.chat.postMessage({
          channel,
          text,
          mrkdwn: !!opts.markdown,
          attachments: [],
          ...(replyTs ? { thread_ts: replyTs } : {}),
        });
        if (!resp.ok) return { ok: false, error: resp.error || 'unknown_error' };
        const ts = resp.ts || null;
        const thread_ts = (resp.message && 'thread_ts' in resp.message ? (resp.message as any).thread_ts : undefined) || replyTs || ts;
        return { ok: true, channelMessageId: ts, threadId: thread_ts ?? null };
      } catch (e: any) {
        // Detect rate limit
        const is429 = typeof e?.code === 'string' && e.code === 'slack_webapi_platform_error' && e?.data?.response?.status === 429;
        const retryAfter = Number(e?.data?.response?.headers?.['retry-after'] ?? e?.data?.response?.headers?.['Retry-After']) || null;
        if (is429) return { ok: false, error: 'rate_limited', rateLimited: true, retryAfterMs: retryAfter ? retryAfter * 1000 : null };
        const msg = (e?.message as string) || 'unknown_error';
        return { ok: false, error: msg };
      }
    };

    // Single retry when rate limited
    const first = await doSend();
    if (first.rateLimited && first.retryAfterMs && first.retryAfterMs > 0) {
      await new Promise((r) => setTimeout(r, first.retryAfterMs));
      const second = await doSend();
      if (!second.ok && second.error === 'rate_limited') return second; // still limited
      return second;
    }
    return first;
  }
}

