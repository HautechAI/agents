import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { SendMessageNode } from '../src/nodes/tools/send_message/send_message.node';
import { LoggerService } from '../src/core/services/logger.service';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { PrismaService } from '../src/core/services/prisma.service';
import { VaultService } from '../src/vault/vault.service';
import { MessagingService } from '../src/messaging/messaging.service';
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

const createVaultStub = (value: string): Partial<VaultService> => ({
  getSecret: vi.fn(async () => value),
});

describe('send_message tool (MessagingService)', () => {
  it('regression: returns missing_channel_descriptor when descriptor absent', async () => {
    const descriptor = null;
    const testingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        MessagingService,
        SendMessageNode,
        { provide: VaultService, useValue: createVaultStub('xoxb-token') },
        { provide: PrismaService, useValue: createPrismaStub(descriptor) },
        { provide: SlackAdapter, useValue: { sendText: vi.fn() } satisfies Partial<SlackAdapter> },
      ],
    }).compile();

    const node = await testingModule.resolve(SendMessageNode);
    const tool = node.getTool();

    const ctx: LLMContext = {
      threadId: 't-thread',
      runId: 'run-1',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { invoke: vi.fn() },
    };
    const response = await tool.execute({ message: 'hello world' }, ctx);
    expect(JSON.parse(response)).toEqual({ ok: false, error: 'missing_channel_descriptor', threadId: 't-thread' });

    await testingModule.close();
  });

  it('deterministic: sends via MessagingService when descriptor available', async () => {
    const descriptor = {
      type: 'slack',
      version: 1,
      identifiers: { channel: 'C1', thread_ts: 'T1' },
      meta: { bot_token_ref: { value: 'secret/slack/BOT', source: 'vault' } },
    };
    const sendText = vi.fn(async () => ({ ok: true, channelMessageId: 'mid', threadId: 'tid' }));
    const testingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        MessagingService,
        SendMessageNode,
        { provide: VaultService, useValue: createVaultStub('xoxb-token') },
        { provide: PrismaService, useValue: createPrismaStub(descriptor) },
        { provide: SlackAdapter, useValue: { sendText } satisfies Partial<SlackAdapter> },
      ],
    }).compile();

    const node = await testingModule.resolve(SendMessageNode);
    const tool = node.getTool();
    const ctx: LLMContext = {
      threadId: 't-thread',
      runId: 'run-1',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { invoke: vi.fn() },
    };
    const response = await tool.execute({ message: 'hello world' }, ctx);
    expect(JSON.parse(response)).toEqual({ ok: true, channelMessageId: 'mid', threadId: 'tid' });
    expect(sendText).toHaveBeenCalledWith({
      token: 'xoxb-token',
      channel: 'C1',
      text: 'hello world',
      thread_ts: 'T1',
    });

    await testingModule.close();
  });
});
