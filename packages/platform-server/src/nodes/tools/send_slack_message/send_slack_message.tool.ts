import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../vault/vault.service';
import { ReferenceFieldSchema, normalizeTokenRef, parseVaultRef, resolveTokenRef } from '../../../utils/refs';
import { SendSlackMessageNode } from './send_slack_message.node';
import { normalizeError } from '../../../messaging/error.util';

export const SendSlackMessageToolStaticConfigSchema = z
  .object({
    bot_token: z.union([
      z.string().min(1).startsWith('xoxb-', { message: 'Slack bot token must start with xoxb-' }),
      ReferenceFieldSchema,
    ]),
  })
  .strict();

export const sendSlackInvocationSchema = z
  .object({
    text: z.string().min(1).describe('Message text.'),
    channel: z.string().min(1).describe('Slack channel ID (C..., D... for DM).'),
    thread_ts: z.string().describe('Thread root timestamp to reply within thread.'),
    broadcast: z.union([z.boolean(), z.null()]).describe('If true when replying in thread, broadcast to channel.'),
    ephemeral_user: z
      .union([z.string(), z.null()])
      .describe('If provided, send ephemeral message only visible to this user.'),
  })
  .strict();

type TokenRef = { value: string; source: 'static' | 'vault' };

export class SendSlackMessageFunctionTool extends FunctionTool<typeof sendSlackInvocationSchema> {
  constructor(
    private node: SendSlackMessageNode,
    private logger: LoggerService,
    private vault: VaultService,
  ) {
    super();
  }
  get name() {
    return 'send_slack_message';
  }
  get description() {
    return 'Send a Slack message (channel or DM). Supports thread replies, broadcast, ephemeral messages.';
  }
  get schema() {
    return sendSlackInvocationSchema;
  }

  async execute(args: z.infer<typeof sendSlackInvocationSchema>): Promise<string> {
    const { channel: channelInput, text, thread_ts, broadcast, ephemeral_user } = args;

    const bot = normalizeTokenRef(this.node.config.bot_token) as TokenRef;
    try {
      if ((bot.source || 'static') === 'vault') parseVaultRef(bot.value);
      else if (!bot.value.startsWith('xoxb-')) {
        return JSON.stringify({ ok: false, error: 'Slack bot token must start with xoxb-' });
      }
      const channel = channelInput;
      if (!channel) return JSON.stringify({ ok: false, error: 'channel is required' });
      const token = await resolveTokenRef(bot, {
        expectedPrefix: 'xoxb-',
        fieldName: 'bot_token',
        vault: this.vault,
      });
      const client = new WebClient(token, { logLevel: undefined });
      if (ephemeral_user) {
        const resp: ChatPostEphemeralResponse | undefined = await client.chat.postEphemeral({
          channel,
          user: ephemeral_user,
          text,
        });
        if (!resp?.ok) {
          const normalized = normalizeError(resp?.error ?? 'unknown_error');
          const payload: Record<string, unknown> = { ok: false, error: normalized.message };
          if (normalized.details) payload.details = normalized.details;
          return JSON.stringify(payload);
        }
        return JSON.stringify({ ok: true, channel, message_ts: resp.message_ts ?? null, ephemeral: true });
      }
      const resp: ChatPostMessageResponse | undefined = await client.chat.postMessage({
        channel,
        text,
        attachments: [],
        ...(thread_ts ? { thread_ts } : {}),
      });
      if (!resp?.ok) {
        const normalized = normalizeError(resp?.error ?? 'unknown_error');
        const payload: Record<string, unknown> = { ok: false, error: normalized.message };
        if (normalized.details) payload.details = normalized.details;
        return JSON.stringify(payload);
      }
      const thread =
        (resp?.message && 'thread_ts' in resp.message
          ? (resp.message as { thread_ts?: string }).thread_ts
          : undefined) ||
        thread_ts ||
        resp?.ts;
      return JSON.stringify({
        ok: true,
        channel: resp?.channel ?? channel,
        ts: resp?.ts ?? null,
        thread_ts: thread ?? null,
        broadcast: !!broadcast,
      });
    } catch (err: unknown) {
      const normalized = normalizeError(err);
      this.logger.error('Error sending Slack message', {
        error: normalized.message,
        details: normalized.details,
      });
      const payload: Record<string, unknown> = { ok: false, error: normalized.message };
      if (normalized.details) payload.details = normalized.details;
      return JSON.stringify(payload);
    }
  }
}
