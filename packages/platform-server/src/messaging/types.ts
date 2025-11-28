import { z } from 'zod';

// Slack-only channel descriptor
// thread_ts is optional (omit if not present)
export const SlackIdentifiersSchema = z.object({ channel: z.string().min(1), thread_ts: z.string().min(1).optional() }).strict();

export const SlackChannelDescriptorSchema = z
  .object({
    type: z.literal('slack'),
    version: z.number().int(),
    identifiers: SlackIdentifiersSchema,
    meta: z
      .object({
        channel_type: z.string().optional(),
        client_msg_id: z.string().optional(),
        event_ts: z.string().optional(),
      })
      .strict()
      .optional(),
    createdBy: z.string().optional(),
  })
  .strict();

export const ManageIdentifiersSchema = z.object({ parentThreadId: z.string().uuid() }).strict();

export const ManageChannelDescriptorSchema = z
  .object({
    type: z.literal('manage'),
    version: z.number().int(),
    identifiers: ManageIdentifiersSchema,
    meta: z
      .object({
        agentTitle: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    createdBy: z.string().optional(),
  })
  .strict();

export const ChannelDescriptorSchema = z.union([SlackChannelDescriptorSchema, ManageChannelDescriptorSchema]);

export type ChannelDescriptor = z.infer<typeof ChannelDescriptorSchema>;
export type SlackChannelDescriptor = z.infer<typeof SlackChannelDescriptorSchema>;
export type ManageChannelDescriptor = z.infer<typeof ManageChannelDescriptorSchema>;

export type ThreadOutboxSource = 'send_message' | 'auto_response' | 'manage_forward';

export type ThreadOutboxSendRequest = {
  threadId: string;
  text: string;
  source: ThreadOutboxSource;
  prefix?: string;
  runId?: string | null;
};

export interface IChannelAdapter {
  sendText(payload: ThreadOutboxSendRequest): Promise<SendResult>;
}

export type SendResult = {
  ok: boolean;
  channelMessageId?: string | null;
  threadId?: string | null;
  error?: string | null;
};

// Adapters are provided via DI; no custom deps bags or adapter interfaces needed for v1.
