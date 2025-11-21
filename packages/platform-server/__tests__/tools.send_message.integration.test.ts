import { describe, it, expect, vi } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { SendMessageNode } from '../src/nodes/tools/send_message/send_message.node';
import { LoggerService } from '../src/core/services/logger.service';
// Avoid importing PrismaService to prevent prisma client load
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { VaultRef } from '../src/vault/vault.service';
import type { ModuleRef } from '@nestjs/core';
import type { LiveGraphRuntime } from '../src/graph/liveGraph.manager';

// Mock slack web api
vi.mock('@slack/socket-mode', () => {
  class MockSocket {
    on() {}
    async start() {}
    async disconnect() {}
  }
  return { SocketModeClient: MockSocket };
});
vi.mock('@slack/web-api', () => {
  type ChatPostMessageArguments = { channel: string; text: string; thread_ts?: string };
  type ChatPostMessageResponse = { ok: boolean; channel?: string; ts?: string; message?: { thread_ts?: string } };
  class WebClient {
    chat = {
      postMessage: vi.fn(async (opts: ChatPostMessageArguments): Promise<ChatPostMessageResponse> => ({ ok: true, channel: opts.channel, ts: '2001', message: { thread_ts: opts.thread_ts || '2001' } })),
    };
  }
  return { WebClient };
});

describe('send_message tool', () => {
  it('returns error when descriptor missing', async () => {
    type PrismaClientStub = { thread: { findUnique: (args: { where: { id: string }; select: { channel: true } }) => Promise<{ channel: unknown | null }> } };
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } } as PrismaClientStub) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const vaultMock = ({ getSecret: async (_ref: VaultRef) => undefined } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    class SlackAdapterStub implements SlackAdapter {
      constructor(private readonly _logger: LoggerService = new LoggerService()) {}
      async sendText(_input: { token: string; channel: string; text: string; thread_ts?: string }): Promise<import('../src/messaging/types').SendResult> {
        return { ok: true, channelMessageId: '2001', threadId: '2001' };
      }
    }
    const trigger = new SlackTrigger(
      new LoggerService(),
      vaultMock,
      ({
        getOrCreateThreadByAlias: async () => 't1',
        updateThreadChannelDescriptor: async () => undefined,
      } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService,
      prismaStub,
      new SlackAdapterStub(),
    );
    const cfg = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } };
    await trigger.setConfig(cfg);
    await trigger.provision();
    const tool = new SendMessageFunctionTool(new LoggerService(), async () => trigger);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(false);
    expect(obj.error).toBe('missing_channel_descriptor');
  });

  it('sends via slack adapter when descriptor present', async () => {
    // Configure trigger-scoped token (static to avoid vault parsing in test)
    const descriptor = { type: 'slack', identifiers: { channel: 'C1' }, meta: {}, version: 1 };
    type PrismaClientStub2 = { thread: { findUnique: (args: { where: { id: string }; select: { channel: true } }) => Promise<{ channel: unknown | null }> } };
    const prismaStub2 = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: descriptor }) } } as PrismaClientStub2) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const vaultMock2 = ({ getSecret: async (_ref: VaultRef) => 'xoxb-abc' } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    class SlackAdapterStub2 implements SlackAdapter {
      constructor(private readonly _logger: LoggerService = new LoggerService()) {}
      async sendText(_opts: { token: string; channel: string; text: string; thread_ts?: string }): Promise<import('../src/messaging/types').SendResult> {
        return { ok: true, channelMessageId: '2001', threadId: '2001' };
      }
    }
    const trigger = new SlackTrigger(
      new LoggerService(),
      vaultMock2,
      ({
        getOrCreateThreadByAlias: async () => 't1',
        updateThreadChannelDescriptor: async () => undefined,
      } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService,
      prismaStub2,
      new SlackAdapterStub2(),
    );
    const cfg2 = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } };
    await trigger.setConfig(cfg2);
    await trigger.provision();
    const tool = new SendMessageFunctionTool(new LoggerService(), async () => trigger);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(true);
    expect(obj.channelMessageId).toBe('2001');
  });

  it('returns tool_invalid_response when trigger result is malformed', async () => {
    const triggerStub = ({
      status: 'ready',
      sendToThread: vi.fn().mockResolvedValueOnce({ notOk: true }),
    } satisfies Pick<SlackTrigger, 'sendToThread'> & { status: SlackTrigger['status'] }) as SlackTrigger;
    const logger = new LoggerService();
    const errorSpy = vi.spyOn(logger, 'error');
    const resolver = vi.fn(async () => triggerStub);
    const tool = new SendMessageFunctionTool(logger, resolver);
    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-1' });
    const obj = JSON.parse(res);
    expect(obj).toEqual({ ok: false, error: 'tool_invalid_response' });
    expect(triggerStub.sendToThread).toHaveBeenCalledWith('thread-1', 'hello');
    expect(errorSpy).toHaveBeenCalledWith('SendMessageFunctionTool invalid send result', { threadId: 'thread-1', result: { notOk: true } });
  });

  it('propagates trigger errors and logs error object', async () => {
    const triggerStub = ({
      status: 'ready',
      sendToThread: vi.fn().mockRejectedValueOnce(new Error('boom')),
    } satisfies Pick<SlackTrigger, 'sendToThread'> & { status: SlackTrigger['status'] }) as SlackTrigger;
    const logger = new LoggerService();
    const errorSpy = vi.spyOn(logger, 'error');
    const resolver = vi.fn(async () => triggerStub);
    const tool = new SendMessageFunctionTool(logger, resolver);
    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-2' });
    const obj = JSON.parse(res);
    expect(obj).toEqual({ ok: false, error: 'boom' });
    expect(errorSpy).toHaveBeenCalled();
    const call = errorSpy.mock.calls.at(0);
    expect(call?.[0]).toBe('SendMessageFunctionTool execute failed');
    expect(call?.[1]).toBeInstanceOf(Error);
    expect((call?.[1] as Error).message).toBe('boom');
    expect(call?.[2]).toEqual({ threadId: 'thread-2' });
  });

  it('returns slacktrigger_unavailable when trigger resolver yields null', async () => {
    const logger = new LoggerService();
    const errorSpy = vi.spyOn(logger, 'error');
    const tool = new SendMessageFunctionTool(logger, async () => null);
    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-3' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'slacktrigger_unavailable' });
    expect(errorSpy).toHaveBeenCalledWith('SendMessageFunctionTool trigger unavailable', { threadId: 'thread-3' });
  });

  it('returns slacktrigger_unprovisioned when trigger not ready', async () => {
    const triggerStub = ({
      status: 'not_ready',
      sendToThread: vi.fn(),
    } satisfies Partial<SlackTrigger>) as SlackTrigger;
    const logger = new LoggerService();
    const errorSpy = vi.spyOn(logger, 'error');
    const tool = new SendMessageFunctionTool(logger, async () => triggerStub);
    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-4' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'slacktrigger_unprovisioned' });
    expect(triggerStub.sendToThread).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('SendMessageFunctionTool trigger not ready', {
      threadId: 'thread-4',
      status: 'not_ready',
    });
  });
});

describe('SendMessageNode', () => {
  const buildTrigger = () => {
    const prismaStub = ({ getClient: () => ({}) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const vaultMock = ({ getSecret: async () => 'xoxb-abc' } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const adapterStub = ({ sendText: vi.fn() } satisfies Partial<SlackAdapter>) as SlackAdapter;
    const persistenceStub = ({
      getOrCreateThreadByAlias: async () => 'thread-1',
      updateThreadChannelDescriptor: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const trigger = new SlackTrigger(new LoggerService(), vaultMock, persistenceStub, prismaStub, adapterStub);
    (trigger as unknown as { _status: string })._status = 'ready';
    return { trigger };
  };

  it('retrieves provisioned SlackTrigger from LiveGraphRuntime', async () => {
    const { trigger } = buildTrigger();
    const sendSpy = vi.spyOn(trigger, 'sendToThread').mockResolvedValue({
      ok: true,
      channelMessageId: 'msg',
      threadId: 'thread-1',
    });
    const runtime = ({
      getNodes: vi.fn(() => [{ id: 'node-1', template: 'slackTrigger', instance: trigger }]),
    } satisfies Pick<LiveGraphRuntime, 'getNodes'>) as LiveGraphRuntime;
    const moduleRef = ({ resolve: vi.fn() } satisfies Pick<ModuleRef, 'resolve'>) as ModuleRef;
    const node = new SendMessageNode(new LoggerService(), moduleRef, runtime);

    const tool = node.getTool();
    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-1' });
    expect(JSON.parse(res)).toEqual({ ok: true, channelMessageId: 'msg', threadId: 'thread-1' });
    expect(sendSpy).toHaveBeenCalledWith('thread-1', 'hello');
    expect(moduleRef.resolve).not.toHaveBeenCalled();
    expect(node.getTool()).toBe(tool);
  });

  it('falls back to null when no ready SlackTrigger is available', async () => {
    const fallbackTrigger = new SlackTrigger(
      new LoggerService(),
      ({ getSecret: async () => 'xoxb-fallback' } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService,
      ({
        getOrCreateThreadByAlias: async () => 'thread-1',
        updateThreadChannelDescriptor: async () => undefined,
      } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService,
      ({ getClient: () => ({}) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService,
      ({ sendText: vi.fn() } satisfies Partial<SlackAdapter>) as SlackAdapter,
    );
    const moduleRef = ({ resolve: vi.fn(async () => fallbackTrigger) } satisfies Pick<ModuleRef, 'resolve'>) as ModuleRef;
    const runtime = ({ getNodes: vi.fn(() => []) } satisfies Pick<LiveGraphRuntime, 'getNodes'>) as LiveGraphRuntime;
    const node = new SendMessageNode(new LoggerService(), moduleRef, runtime);
    const tool = node.getTool();

    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-2' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'slacktrigger_unavailable' });
    expect(moduleRef.resolve).toHaveBeenCalledWith(SlackTrigger, undefined, { strict: false });
  });
});
