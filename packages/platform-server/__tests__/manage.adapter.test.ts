import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ManageAdapter } from '../src/messaging/manage/manage.adapter';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

describe('ManageAdapter', () => {
  const PARENT_THREAD_ID = '11111111-1111-1111-8111-111111111111';
  const CHILD_THREAD_ID = '22222222-2222-4222-9222-222222222222';

  const makePrisma = (options: { parentId: string | null; alias?: string | null; channel?: unknown }) => ({
    getClient: () => ({
      thread: {
        findUnique: vi.fn(async () => ({ parentId: options.parentId, alias: options.alias ?? null, channel: options.channel ?? null })),
      },
    }),
  }) as unknown as PrismaService & {
    getClient(): { thread: { findUnique: ReturnType<typeof vi.fn> } };
  };

  const makePersistence = () => ({
    getThreadAgentTitle: vi.fn(async () => 'Worker Alpha'),
  }) as unknown as AgentsPersistenceService & {
    getThreadAgentTitle: ReturnType<typeof vi.fn>;
  };

  let prisma: PrismaService & { getClient(): { thread: { findUnique: ReturnType<typeof vi.fn> } } };
  let persistence: AgentsPersistenceService & {
    getThreadAgentTitle: ReturnType<typeof vi.fn>;
  };
  let adapter: ManageAdapter;

  beforeEach(() => {
    prisma = makePrisma({ parentId: PARENT_THREAD_ID });
    persistence = makePersistence();
    adapter = new ManageAdapter(prisma, persistence);
  });

  it('returns error when parent thread missing', async () => {
    prisma = makePrisma({ parentId: null });
    adapter = new ManageAdapter(prisma, persistence);
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'response',
      source: 'send_message',
      runId: 'run-child',
    });
    expect(res).toEqual({ ok: false, error: 'manage_missing_parent' });
    expect(persistence.getThreadAgentTitle).not.toHaveBeenCalled();
  });

  it('computes forwarded message with default prefix', async () => {
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'Work complete',
      source: 'auto_response',
      runId: 'run-child',
    });
    expect(res).toEqual({
      ok: true,
      parentThreadId: PARENT_THREAD_ID,
      forwardedText: 'From Worker Alpha: Work complete',
      agentTitle: 'Worker Alpha',
      childThreadId: CHILD_THREAD_ID,
      childThreadAlias: null,
      runId: 'run-child',
      showCorrelationInOutput: false,
    });
    expect(persistence.getThreadAgentTitle).toHaveBeenCalledWith(CHILD_THREAD_ID);
  });

  it('applies asyncPrefix metadata with interpolation and correlation', async () => {
    const descriptor = {
      type: 'manage' as const,
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: {
        agentTitle: 'Worker Alpha',
        asyncPrefix: '<<{{agentTitle}}>> ',
        showCorrelationInOutput: true,
      },
      createdBy: 'manage-tool',
    };
    prisma = makePrisma({ parentId: PARENT_THREAD_ID, alias: `manage:${PARENT_THREAD_ID}:alias-7`, channel: descriptor });
    adapter = new ManageAdapter(prisma, persistence);
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'status update',
      source: 'auto_response',
      runId: 'run-child',
    });

    expect(res).toEqual({
      ok: true,
      parentThreadId: PARENT_THREAD_ID,
      forwardedText: `<<Worker Alpha>> [alias=alias-7; thread=${CHILD_THREAD_ID}] status update`,
      agentTitle: 'Worker Alpha',
      childThreadId: CHILD_THREAD_ID,
      childThreadAlias: 'alias-7',
      runId: 'run-child',
      showCorrelationInOutput: true,
    });
  });

  it('prefers explicit prefix argument over descriptor meta', async () => {
    const descriptor = {
      type: 'manage' as const,
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: {
        asyncPrefix: 'unused-prefix ',
        showCorrelationInOutput: true,
      },
      createdBy: 'manage-tool',
    };
    prisma = makePrisma({ parentId: PARENT_THREAD_ID, alias: `manage:${PARENT_THREAD_ID}:alias-9`, channel: descriptor });
    adapter = new ManageAdapter(prisma, persistence);
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'status update',
      source: 'auto_response',
      runId: 'run-child',
      prefix: '[Relay] ',
    });

    expect(res.forwardedText).toBe(`[Relay] [alias=alias-9; thread=${CHILD_THREAD_ID}] status update`);
    expect(res.showCorrelationInOutput).toBe(true);
  });
});
