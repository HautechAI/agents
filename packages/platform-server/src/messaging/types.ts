import { z } from 'zod';
import { ReferenceFieldSchema } from '../utils/refs';

// Slack-only channel descriptor
// thread_ts is optional (omit if not present)
export const SlackIdentifiersSchema = z.object({ channel: z.string().min(1), thread_ts: z.string().min(1).optional() }).strict();

export const ChannelDescriptorSchema = z
  .object({
    type: z.literal('slack'),
    version: z.number().int(),
    identifiers: SlackIdentifiersSchema,
    meta: z
      .object({
        channel_type: z.string().optional(),
        client_msg_id: z.string().optional(),
        event_ts: z.string().optional(),
        bot_token_ref: ReferenceFieldSchema.optional(),
      })
      .strict()
      .optional(),
    createdBy: z.string().optional(),
  })
  .strict();

export type ChannelDescriptor = z.infer<typeof ChannelDescriptorSchema>;

export type SendResult = {
  ok: boolean;
  channelMessageId?: string | null;
  threadId?: string | null;
  error?: string | null;
};

// Adapters are provided via DI; no custom deps bags or adapter interfaces needed for v1.
