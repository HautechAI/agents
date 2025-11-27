import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemindersCancellationService } from '../src/agents/remindersCancellation.service';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';

const loggerStub = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
};

const createRuntimeFixture = (toolNode: RemindMeNode) => ({
  getNodes: vi.fn(() => [
    { template: 'remindMeTool', instance: toolNode },
    { template: 'otherTool', instance: {} },
  ]),
});

describe('RemindersCancellationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels runtime reminders, updates persistence, and emits metrics', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 3 })),
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

    let capturedCancelledAt: Date | undefined;
    const cancelSpy = vi
      .spyOn(tool, 'cancelByThread')
      .mockImplementation(async (_threadId: string, prismaArg: unknown, cancelledAt?: Date) => {
        capturedCancelledAt = cancelledAt;
        expect(prismaArg).toBe(prismaClient);
        return 2;
      });

    const runtime = createRuntimeFixture(node);

    const service = new RemindersCancellationService(
      prismaService as any,
      loggerStub as any,
      eventsBus as any,
      runtime as any,
    );

    const result = await service.cancelThread('thread-123');

    expect(capturedCancelledAt).toBeInstanceOf(Date);
    expect(cancelSpy).toHaveBeenCalledWith('thread-123', prismaClient, capturedCancelledAt);
    expect(prismaClient.reminder.updateMany).toHaveBeenCalledWith({
      where: { threadId: 'thread-123', completedAt: null, cancelledAt: null },
      data: { cancelledAt: capturedCancelledAt },
    });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-123' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'thread-123' });
    expect(result).toEqual({ cancelledDb: 3, cancelledRuntime: 2 });
  });

  it('handles runtime cancellation errors gracefully', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
      emitReminderCount: vi.fn(),
    };

    const node = new RemindMeNode(eventsBus as any, prismaService as any);
    node.init({ nodeId: 'node-b' } as any);
    const tool = node.getTool();
    vi.spyOn(tool, 'cancelByThread').mockRejectedValue(new Error('boom'));

    const runtime = createRuntimeFixture(node);

    const service = new RemindersCancellationService(
      prismaService as any,
      loggerStub as any,
      eventsBus as any,
      runtime as any,
    );

    const result = await service.cancelThread('thread-err');

    expect(loggerStub.warn).toHaveBeenCalledWith(
      'RemindersCancellationService runtime cancellation error',
      expect.objectContaining({ threadId: 'thread-err' }),
    );
    expect(prismaClient.reminder.updateMany).toHaveBeenCalled();
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-err' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'thread-err' });
    expect(result.cancelledRuntime).toBe(0);
    expect(result.cancelledDb).toBe(1);
  });
});
