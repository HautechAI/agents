import { WebClient, type ChatPostMessageResponse } from '@slack/web-api';
import type { ChannelAdapter, ChannelAdapterDeps, SendResult, ChannelDescriptor } from '../types';
import { SlackIdentifiersSchema } from '../types';

export class SlackAdapter implements ChannelAdapter {
  constructor(private deps: ChannelAdapterDeps) {}

  async sendText(input: { token: string; threadId: string; text: string; descriptor: ChannelDescriptor }): Promise<SendResult> {
    const { descriptor, threadId, text, token } = input;
    const parsedIds = SlackIdentifiersSchema.safeParse(descriptor.identifiers);
    if (!parsedIds.success) throw new Error('Slack descriptor identifiers invalid');
    const ids = parsedIds.data;
    const channel = ids.channel;
    const replyTs = ids.thread_ts ?? undefined;

    this.deps.logger.info('SlackAdapter.sendText', {
      type: descriptor.type,
      threadId,
      channel,
      replyTs,
    });

    const client = new WebClient(token, { logLevel: undefined });
    try {
      const resp: ChatPostMessageResponse = await client.chat.postMessage({
        channel,
        text,
        ...(replyTs ? { thread_ts: replyTs } : {}),
      });
      if (!resp.ok) return { ok: false, error: resp.error || 'unknown_error' };
      const ts: string | null = resp.ts ?? null;
      let thread_ts: string | undefined;
      if (resp.message && typeof resp.message === 'object') {
        const m = resp.message as Record<string, unknown>;
        if (typeof m.thread_ts === 'string') thread_ts = m.thread_ts;
      }
      const threadIdOut = thread_ts ?? replyTs ?? ts ?? null;
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
