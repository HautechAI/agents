import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { TriggerMessagingService } from '../src/channels/trigger.messaging';
import { SendMessageFunctionTool } from '../src/graph/nodes/tools/send_message/send_message.tool';

describe('SendMessageFunctionTool', () => {
  it('routes via TriggerMessagingService using threadId', async () => {
    const messenger = { send: vi.fn(async () => ({ ok: true, ref: { type: 'slack', channel: 'C', ts: '1' }, attempts: 1 })) };
    const triggers = { resolve: vi.fn(() => messenger) } as unknown as TriggerMessagingService;
    const persistence = {
      getThreadChannel: vi.fn(async () => ({ type: 'slack', channel: 'C', meta: { triggerNodeId: 'Trig-1' } })),
    } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({ providers: [LoggerService, { provide: AgentsPersistenceService, useValue: persistence }, { provide: TriggerMessagingService, useValue: triggers }, SendMessageFunctionTool] }).compile();
    const tool = await module.resolve(SendMessageFunctionTool);
    const res = await tool.execute({ message: 'hello' } as any, { threadId: 't-1' } as any);
    const parsed = JSON.parse(res);
    expect(parsed.ok).toBe(true);
    expect(parsed.attempts).toBe(1);
    expect(triggers.resolve).toHaveBeenCalledWith('slack', 'Trig-1');
    expect(messenger.send).toHaveBeenCalledWith({ type: 'slack', channel: 'C', meta: { triggerNodeId: 'Trig-1' } }, { text: 'hello' });
  });
  it('errors when threadId is missing', async () => {
    const triggers = { resolve: vi.fn() } as unknown as TriggerMessagingService;
    const persistence = { getThreadChannel: vi.fn() } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({ providers: [LoggerService, { provide: AgentsPersistenceService, useValue: persistence }, { provide: TriggerMessagingService, useValue: triggers }, SendMessageFunctionTool] }).compile();
    const tool = await module.resolve(SendMessageFunctionTool);
    await expect(tool.execute({ message: 'x' } as any, {} as any)).rejects.toThrow('send_message requires runtime threadId');
  });
});
