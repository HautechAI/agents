import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ChannelRegistry } from '../src/channels/channel.registry';
import { SendMessageFunctionTool } from '../src/graph/nodes/tools/send_message/send_message.tool';

describe('SendMessageFunctionTool', () => {
  it('routes via ChannelRegistry using threadId', async () => {
    const registry = { send: vi.fn(async () => ({ ok: true, ref: { channel: 'C', ts: '1' }, attempts: 1 })) } as unknown as ChannelRegistry;
    const module = await Test.createTestingModule({ providers: [LoggerService, { provide: ChannelRegistry, useValue: registry }, SendMessageFunctionTool] }).compile();
    const tool = await module.resolve(SendMessageFunctionTool);
    const res = await tool.execute({ text: 'hello' } as any, { threadId: 't-1' } as any);
    const parsed = JSON.parse(res);
    expect(parsed.ok).toBe(true);
    expect(parsed.attempts).toBe(1);
    expect(registry.send).toHaveBeenCalledWith('t-1', { text: 'hello', broadcast: undefined, ephemeral_user: undefined });
  });
  it('errors when threadId is missing', async () => {
    const registry = { send: vi.fn(async () => ({ ok: true, attempts: 1 })) } as unknown as ChannelRegistry;
    const module = await Test.createTestingModule({ providers: [LoggerService, { provide: ChannelRegistry, useValue: registry }, SendMessageFunctionTool] }).compile();
    const tool = await module.resolve(SendMessageFunctionTool);
    await expect(tool.execute({ text: 'x' } as any, {} as any)).rejects.toThrow('send_message requires runtime threadId');
  });
});

