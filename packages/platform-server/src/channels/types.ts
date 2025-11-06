import { z } from 'zod';

export const SlackChannelInfoSchema = z
  .object({
    type: z.literal('slack'),
    channel: z.string().min(1),
    thread_ts: z.string().min(1).optional(),
    user: z.string().min(1).optional(),
  })
  .strict();

export const ChannelInfoSchema = z.union([SlackChannelInfoSchema]).describe('Per-thread channel metadata');

export type SlackChannelInfo = z.infer<typeof SlackChannelInfoSchema>;
export type ChannelInfo = z.infer<typeof ChannelInfoSchema>;

