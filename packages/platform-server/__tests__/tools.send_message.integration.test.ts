import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { SendMessageNode } from '../src/nodes/tools/send_message/send_message.node';
import { LoggerService } from '../src/core/services/logger.service';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { PrismaService } from '../src/core/services/prisma.service';
import { VaultService } from '../src/vault/vault.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { Signal } from '../src/signal';
import type { LLMContext } from '../src/llm/types';

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
      postMessage: vi.fn(
        async (opts: ChatPostMessageArguments): Promise<ChatPostMessageResponse> => ({
          ok: true,
          channel: opts.channel,
          ts: '2001',
          message: { thread_ts: opts.thread_ts || '2001' },
        }),
      ),
    };
  }
  return { WebClient };
});

const createPrismaStub = (descriptor: unknown): Partial<PrismaService> => ({
  getClient: () => ({
    thread: {
      findUnique: async () => ({ channel: descriptor }),
    },
  }),
});

const createVaultStub = (): Partial<VaultService> => ({
  getSecret: vi.fn(),
});

const createPersistenceStub = (): Partial<AgentsPersistenceService> => ({
  getOrCreateThreadByAlias: vi.fn(async () => 't1'),
  updateThreadChannelDescriptor: vi.fn(),
});

describe('send_message tool (SlackTrigger bridge)', () => {
  it('regression: SendMessageFunctionTool fails without runtime SlackTrigger bridge', async () => {
    const descriptor = { type: 'slack', version: 1, identifiers: { channel: 'C1', thread_ts: 'T1' }, meta: {} };
    const testingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        SendMessageNode,
        SlackTrigger,
        AgentNode,
        { provide: VaultService, useValue: createVaultStub() },
        { provide: AgentsPersistenceService, useValue: createPersistenceStub() },
        { provide: PrismaService, useValue: createPrismaStub(descriptor) },
        { provide: SlackAdapter, useValue: { sendText: vi.fn() } satisfies Partial<SlackAdapter> },
        { provide: ConfigService, useValue: {} as ConfigService },
        { provide: LLMProvisioner, useValue: { getLLM: vi.fn() } satisfies Partial<LLMProvisioner> },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), clear: vi.fn() } satisfies Partial<RunSignalsRegistry> },
      ],
    }).compile();

    const node = await testingModule.resolve(SendMessageNode);
    const tool = node.getTool();
    const agent = await testingModule.resolve(AgentNode);
    agent.init({ nodeId: 'agent-node' });
    expect(agent.getSlackTrigger()).toBeUndefined();

    const ctx: LLMContext = {
      threadId: 't-thread',
      runId: 'run-1',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: agent,
    };
    const response = await tool.execute({ message: 'hello world' }, ctx);
    expect(JSON.parse(response)).toEqual({ ok: false, error: 'slacktrigger_missing' });

    const trigger = await testingModule.resolve(SlackTrigger);
    const sendResult = await trigger.sendToThread('legacy-thread', 'hello');
    expect(sendResult.ok).toBe(false);
    expect(sendResult.error).toBe('slacktrigger_unprovisioned');

    await testingModule.close();
  });

  it('deterministic: runtime subscription registers trigger on AgentNode and send succeeds', async () => {
    const descriptor = { type: 'slack', version: 1, identifiers: { channel: 'C1', thread_ts: 'T1' }, meta: {} };
    const sendText = vi.fn(async () => ({ ok: true, channelMessageId: 'mid', threadId: 'tid' }));
    const testingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        SendMessageNode,
        SlackTrigger,
        AgentNode,
        { provide: VaultService, useValue: createVaultStub() },
        { provide: AgentsPersistenceService, useValue: createPersistenceStub() },
        { provide: PrismaService, useValue: createPrismaStub(descriptor) },
        { provide: SlackAdapter, useValue: { sendText } satisfies Partial<SlackAdapter> },
        { provide: ConfigService, useValue: {} as ConfigService },
        { provide: LLMProvisioner, useValue: { getLLM: vi.fn() } satisfies Partial<LLMProvisioner> },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), clear: vi.fn() } satisfies Partial<RunSignalsRegistry> },
      ],
    }).compile();

    const trigger = await testingModule.resolve(SlackTrigger);
    await trigger.setConfig({
      app_token: { value: 'xapp-token', source: 'static' },
      bot_token: { value: 'xoxb-token', source: 'static' },
    });
    await trigger.provision();

    const agent = await testingModule.resolve(AgentNode);
    agent.init({ nodeId: 'agent-node' });
    await trigger.subscribe(agent);
    expect(agent.getSlackTrigger()).toBe(trigger);

    const node = await testingModule.resolve(SendMessageNode);
    const tool = node.getTool();
    const ctx: LLMContext = {
      threadId: 't-thread',
      runId: 'run-1',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: agent,
    };
    const response = await tool.execute({ message: 'hello world' }, ctx);
    expect(JSON.parse(response)).toEqual({ ok: true, channelMessageId: 'mid', threadId: 'tid' });
    expect(sendText).toHaveBeenCalledWith({
      token: 'xoxb-token',
      channel: 'C1',
      text: 'hello world',
      thread_ts: 'T1',
    });

    await trigger.unsubscribe(agent);
    expect(agent.getSlackTrigger()).toBeUndefined();

    await trigger.deprovision();
    await testingModule.close();
  });
});
