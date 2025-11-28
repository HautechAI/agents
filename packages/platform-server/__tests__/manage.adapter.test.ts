import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ManageAdapter } from '../src/messaging/manage/manage.adapter';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

describe('ManageAdapter', () => {
  const makePrisma = (parentId: string | null) => ({
    getClient: () => ({
      thread: {
        findUnique: vi.fn(async () => (parentId ? { parentId } : { parentId: null })),
      },
    }),
  }) as unknown as PrismaService & {
    getClient(): { thread: { findUnique: ReturnType<typeof vi.fn> } };
  };

  const makePersistence = () => ({
    recordOutboxMessage: vi.fn(async () => ({ messageId: 'm-parent' })),
    getThreadAgentTitle: vi.fn(async () => 'Worker Alpha'),
  }) as unknown as AgentsPersistenceService & {
    recordOutboxMessage: ReturnType<typeof vi.fn>;
    getThreadAgentTitle: ReturnType<typeof vi.fn>;
  };

  let prisma: PrismaService & { getClient(): { thread: { findUnique: ReturnType<typeof vi.fn> } } };
  let persistence: AgentsPersistenceService & {
    recordOutboxMessage: ReturnType<typeof vi.fn>;
    getThreadAgentTitle: ReturnType<typeof vi.fn>;
  };
  let adapter: ManageAdapter;

  beforeEach(() => {
    prisma = makePrisma('parent-thread');
    persistence = makePersistence();
    adapter = new ManageAdapter(prisma, persistence);
  });

  it('returns error when parent thread missing', async () => {
    prisma = makePrisma(null);
    adapter = new ManageAdapter(prisma, persistence);
    const res = await adapter.forwardChildMessage({
      childThreadId: 'child-thread',
      text: 'response',
      source: 'send_message',
      runId: 'run-child',
    });
    expect(res).toEqual({ ok: false, error: 'manage_missing_parent' });
    expect(persistence.recordOutboxMessage).not.toHaveBeenCalled();
  });

  it('persists forwarded message with prefix and returns parent thread', async () => {
    const res = await adapter.forwardChildMessage({
      childThreadId: 'child-thread',
      text: 'Work complete',
      source: 'auto_response',
      runId: 'run-child',
    });
    expect(res).toEqual({
      ok: true,
      parentThreadId: 'parent-thread',
      forwardedText: 'From Worker Alpha: Work complete',
    });
    expect(persistence.getThreadAgentTitle).toHaveBeenCalledWith('child-thread');
    expect(persistence.recordOutboxMessage).toHaveBeenCalledWith({
      threadId: 'parent-thread',
      text: 'From Worker Alpha: Work complete',
      role: 'assistant',
      source: 'manage_forward',
      runId: 'run-child',
    });
  });

  it('allows overriding prefix', async () => {
    const res = await adapter.forwardChildMessage({
      childThreadId: 'child-thread',
      text: 'status update',
      source: 'auto_response',
      runId: 'run-child',
      prefix: '[Relay] ',
    });
    expect(res.forwardedText).toBe('[Relay] status update');
    expect(persistence.recordOutboxMessage).toHaveBeenCalledWith({
      threadId: 'parent-thread',
      text: '[Relay] status update',
      role: 'assistant',
      source: 'manage_forward',
      runId: 'run-child',
    });
  });
});
