import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/graph/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ConfigService } from '../src/core/services/config.service';
import { VaultService } from '../src/vault/vault.service';

// Mock slack web api
import { vi } from 'vitest';
vi.mock('@slack/web-api', () => {
  class WebClient {
    constructor(_token: string) {}
    chat = {
      postMessage: async (opts: any) => ({ ok: true, channel: opts.channel, ts: '2001', message: { thread_ts: opts.thread_ts || '2001' } }),
    };
  }
  return { WebClient };
});

describe('send_message tool', () => {
  it('returns error when descriptor missing', async () => {
    const prismaStub = { getClient: () => ({ thread: { findUnique: async () => ({ channel: null, channelVersion: null }) } }) } as unknown as PrismaService;
    const tool = new SendMessageFunctionTool(new LoggerService(), { getSecret: async () => null } as any, prismaStub, new ConfigService().init({} as any));
    const res = await tool.execute({ text: 'hello' } as any, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(false);
    expect(obj.error).toBe('missing_channel_descriptor');
  });

  it('sends via slack adapter when descriptor present', async () => {
    const prismaStub = { getClient: () => ({ thread: { findUnique: async () => ({ channel: { type: 'slack', identifiers: { channelId: 'C1' }, meta: {} }, channelVersion: 1 }) } }) } as unknown as PrismaService;
    const tool = new SendMessageFunctionTool(new LoggerService(), { getSecret: async () => 'xoxb-abc' } as any, prismaStub, ConfigService.fromEnv());
    const res = await tool.execute({ text: 'hello' } as any, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(true);
    expect(obj.channelMessageId).toBe('2001');
  });
});
