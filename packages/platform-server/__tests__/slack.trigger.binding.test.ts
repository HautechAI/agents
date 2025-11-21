import { describe, it, expect, vi } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { LoggerService } from '../src/core/services/logger.service';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';

const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const makeTrigger = (options?: { channel?: unknown | null }) => {
  const logger = makeLogger();
  const vault = ({
    getSecret: vi.fn(async () => 'secret'),
  } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
  const persistence = ({
    getOrCreateThreadByAlias: vi.fn(async () => 'thread-1'),
    updateThreadChannelDescriptor: vi.fn(async () => undefined),
  } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
  const threadValue = options?.channel ?? null;
  const prisma = ({
    getClient: () => ({
      thread: {
        findUnique: vi.fn(async () => ({ channel: threadValue })),
      },
    }),
  } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
  const slackAdapter = ({
    sendText: vi.fn(async () => ({ ok: true, channelMessageId: 'm1', threadId: 'thr-1' })),
  } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
  const trigger = new SlackTrigger(logger as unknown as LoggerService, vault, persistence, prisma, slackAdapter);
  return { trigger, logger, slackAdapter };
};

describe('SlackTrigger method binding', () => {
  it('preserves context for sendToThread when method is extracted', async () => {
    const { trigger, logger, slackAdapter } = makeTrigger({ channel: null });
    await trigger.setConfig({
      app_token: { value: 'xapp-abc', source: 'static' },
      bot_token: { value: 'xoxb-abc', source: 'static' },
    });
    (trigger as unknown as { botToken: string }).botToken = 'xoxb-abc';

    const unboundSend = trigger.sendToThread;
    await expect(unboundSend('thread-1', 'hello')).resolves.toEqual({ ok: false, error: 'missing_channel_descriptor' });

    expect(logger.error).toHaveBeenCalledWith('SlackTrigger.sendToThread: missing descriptor', { threadId: 'thread-1' });
    expect(slackAdapter.sendText).not.toHaveBeenCalled();
  });

  it('preserves context for subscribe/unsubscribe when extracted via ports', async () => {
    const { trigger } = makeTrigger();

    const { subscribe: extractedSubscribe, unsubscribe: extractedUnsubscribe } = trigger;
    const listener = { invoke: vi.fn(async () => undefined) };

    await extractedSubscribe(listener);
    expect(trigger.listeners()).toHaveLength(1);

    await extractedUnsubscribe(listener);
    expect(trigger.listeners()).toHaveLength(0);

    const portConfig = trigger.getPortConfig();
    const subscribeViaPort = (trigger as any)[portConfig.sourcePorts.subscribe.create];
    const unsubscribeViaPort = (trigger as any)[portConfig.sourcePorts.subscribe.destroy];
    const listener2 = { invoke: vi.fn(async () => undefined) };

    await subscribeViaPort(listener2);
    expect(trigger.listeners()).toHaveLength(1);

    await unsubscribeViaPort(listener2);
    expect(trigger.listeners()).toHaveLength(0);
  });
});
