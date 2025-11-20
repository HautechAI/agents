import { describe, it, expect, vi } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { LoggerService } from '../src/core/services/logger.service';
import type { VaultService } from '../src/vault/vault.service';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';

const makeDescriptor = () => ({
  type: 'slack' as const,
  version: 1,
  identifiers: { channel: 'C123', thread_ts: '123.456' },
  meta: {},
});

describe('SlackTrigger.sendToThread error normalization', () => {
  it('returns normalized envelope when SlackAdapter throws', async () => {
    const logger = new LoggerService();
    const vault = { getSecret: vi.fn() } as unknown as VaultService;
    const persistence = {
      getOrCreateThreadByAlias: vi.fn(),
      updateThreadChannelDescriptor: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const prisma = {
      getClient: () => ({
        thread: {
          findUnique: vi.fn().mockResolvedValue({ channel: makeDescriptor() }),
        },
      }),
    } as unknown as PrismaService;

    const adapter = {
      sendText: vi.fn(async () => {
        throw new Error('slack transport 500');
      }),
    } as unknown as SlackAdapter;

    const trigger = new SlackTrigger(logger, vault, persistence, prisma, adapter);
    // Provision stubs: emulate bot token already loaded
    (trigger as any).botToken = 'xoxb-test';

    const result = await trigger.sendToThread('thread-123', 'hello');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('slack transport 500');
    expect(result.details?.name).toBe('Error');
  });
});
