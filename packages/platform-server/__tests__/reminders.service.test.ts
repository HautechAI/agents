import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemindersService } from '../src/agents/reminders.service';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';

const loggerStub = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
};

type RuntimeNode = { id: string; template?: string; instance: unknown };

const createRuntimeFixture = (...nodes: RuntimeNode[]) => ({
  getNodes: vi.fn(() =>
    nodes.map((node) => ({
      id: node.id,
      template: node.template ?? 'remindMeTool',
      instance: node.instance,
    })),
  ),
});

describe('RemindersService.cancelByThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels runtime reminders, updates persistence, and emits metrics', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 3 })),
      },
      thread: {
        findUnique: vi.fn(async () => ({ id: 'thread-123' })),
        findMany: vi.fn(async () => []),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
      emitReminderCount: vi.fn(),
    };

    const node = new RemindMeNode(eventsBus as any, prismaService as any);
    node.init({ nodeId: 'node-a' } as any);
    const tool = node.getTool();

    const clearSpy = vi
      .spyOn(tool, 'clearTimersByThread')
      .mockImplementation((threadId: string) => {
        expect(threadId).toBe('thread-123');
        return ['r1', 'r2'];
      });

    const runtime = createRuntimeFixture({ id: 'node-a', instance: node }, { id: 'node-other', template: 'otherTool', instance: {} });

    const service = new RemindersService(
      prismaService as any,
      loggerStub as any,
      eventsBus as any,
      runtime as any,
    );

    const result = await service.cancelByThread({ threadId: 'thread-123' });

    expect(clearSpy).toHaveBeenCalledWith('thread-123');
    const [[updateArgs]] = prismaClient.reminder.updateMany.mock.calls as Array<[{
      where: unknown;
      data: { cancelledAt: Date };
    }]>;
    expect(updateArgs.where).toEqual({ threadId: { in: ['thread-123'] }, completedAt: null, cancelledAt: null });
    expect(updateArgs.data.cancelledAt).toBeInstanceOf(Date);
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-123' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'thread-123' });
    expect(result).toEqual({ cancelledDb: 3, clearedRuntime: 2, threadIds: ['thread-123'] });
  });

  it('continues cancellation when a node throws and cascades to descendants when requested', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 4 })),
      },
      thread: {
        findUnique: vi.fn(async () => ({ id: 'thread-err' })),
        findMany: vi.fn(async ({ where }: { where: { parentId: { in: string[] } } }) => {
          if (where.parentId.in.includes('thread-err')) return [{ id: 'child-a' }, { id: 'child-b' }];
          return [];
        }),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
      emitReminderCount: vi.fn(),
    };
    const failingNode = new RemindMeNode(eventsBus as any, prismaService as any);
    failingNode.init({ nodeId: 'node-fail' } as any);
    const failingTool = failingNode.getTool();
    vi.spyOn(failingTool, 'clearTimersByThread').mockImplementation((threadId: string) => {
      if (threadId === 'thread-err') throw new Error('boom');
      return [];
    });

    const succeedingNode = new RemindMeNode(eventsBus as any, prismaService as any);
    succeedingNode.init({ nodeId: 'node-ok' } as any);
    const succeedingTool = succeedingNode.getTool();
    vi.spyOn(succeedingTool, 'clearTimersByThread').mockImplementation((threadId: string) => {
      if (threadId === 'thread-err') return ['a', 'b'];
      if (threadId === 'child-a') return ['c'];
      if (threadId === 'child-b') return ['d', 'e'];
      return [];
    });

    const runtime = createRuntimeFixture(
      { id: 'node-fail', instance: failingNode },
      { id: 'node-ok', instance: succeedingNode },
      { id: 'node-other', template: 'otherTool', instance: {} },
    );

    const service = new RemindersService(
      prismaService as any,
      loggerStub as any,
      eventsBus as any,
      runtime as any,
    );

    const result = await service.cancelByThread({ threadId: 'thread-err', includeDescendants: true });

    expect(loggerStub.warn).toHaveBeenCalledWith(
      'RemindersService runtime cancellation error',
      expect.objectContaining({ threadId: 'thread-err', nodeId: 'node-fail' }),
    );
    expect(succeedingTool.clearTimersByThread).toHaveBeenCalledWith('thread-err');
    expect(succeedingTool.clearTimersByThread).toHaveBeenCalledWith('child-a');
    expect(succeedingTool.clearTimersByThread).toHaveBeenCalledWith('child-b');
    const [[cascadeArgs]] = prismaClient.reminder.updateMany.mock.calls as Array<[{
      where: { threadId: { in: string[] }; completedAt: null; cancelledAt: null };
      data: { cancelledAt: Date };
    }]>;
    expect(cascadeArgs.where.threadId.in.sort()).toEqual(['child-a', 'child-b', 'thread-err']);
    expect(cascadeArgs.data.cancelledAt).toBeInstanceOf(Date);
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-err' });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'child-a' });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'child-b' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'child-b' });
    expect(result.clearedRuntime).toBe(5);
    expect(result.cancelledDb).toBe(4);
    expect(result.threadIds.sort()).toEqual(['child-a', 'child-b', 'thread-err']);
  });
});
