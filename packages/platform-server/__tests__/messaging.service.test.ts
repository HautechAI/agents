import { describe, it, expect, vi } from 'vitest';
import { MessagingService } from '../src/messaging/messaging.service';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { VaultService } from '../src/vault/vault.service';
import type { LoggerService } from '../src/core/services/logger.service';

const makeLogger = (): Pick<LoggerService, 'info' | 'debug' | 'warn' | 'error'> => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const makePrisma = (descriptor: unknown): PrismaService =>
  ({
    getClient: () => ({
      thread: {
        findUnique: async () => ({ channel: descriptor }),
      },
    }),
  }) as unknown as PrismaService;

describe('MessagingService', () => {
  it('returns missing_channel_descriptor when thread has no descriptor', async () => {
    const service = new MessagingService(
      ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter,
      ({ getSecret: vi.fn() } satisfies Pick<VaultService, 'getSecret'>) as VaultService,
      makePrisma(null),
      makeLogger() as LoggerService,
    );

    const result = await service.sendToThread('t-1', 'hello');
    expect(result).toEqual({ ok: false, error: 'missing_channel_descriptor' });
  });

  it('returns missing_bot_token_ref when descriptor lacks token ref', async () => {
    const descriptor = { type: 'slack', version: 1, identifiers: { channel: 'C1', thread_ts: 'T1' } };
    const service = new MessagingService(
      ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter,
      ({ getSecret: vi.fn() } satisfies Pick<VaultService, 'getSecret'>) as VaultService,
      makePrisma(descriptor),
      makeLogger() as LoggerService,
    );

    const result = await service.sendToThread('t-2', 'hello');
    expect(result).toEqual({ ok: false, error: 'missing_bot_token_ref' });
  });

  it('sends message when descriptor and token ref exist', async () => {
    const descriptor = {
      type: 'slack',
      version: 1,
      identifiers: { channel: 'C1', thread_ts: 'T1' },
      meta: { bot_token_ref: { value: 'secret/slack/BOT', source: 'vault' } },
    };
    const sendText = vi.fn(async () => ({ ok: true, channelMessageId: 'mid', threadId: 'T1' }));
    const getSecret = vi.fn(async () => 'xoxb-token');
    const service = new MessagingService(
      ({ sendText } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter,
      ({ getSecret } satisfies Pick<VaultService, 'getSecret'>) as VaultService,
      makePrisma(descriptor),
      makeLogger() as LoggerService,
    );

    const result = await service.sendToThread('t-3', 'hello');
    expect(result).toEqual({ ok: true, channelMessageId: 'mid', threadId: 'T1' });
    expect(sendText).toHaveBeenCalledWith({ token: 'xoxb-token', channel: 'C1', text: 'hello', thread_ts: 'T1' });
  });
});
