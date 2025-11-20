import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunEventsService, type ToolOutputChunkPayload, type ToolOutputTerminalPayload } from '../src/events/run-events.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';

class CapturingPublisher extends NoopGraphEventsPublisher {
  public chunks: Array<Parameters<NoopGraphEventsPublisher['emitToolOutputChunk']>[0]> = [];
  public terminals: Array<Parameters<NoopGraphEventsPublisher['emitToolOutputTerminal']>[0]> = [];

  override emitToolOutputChunk(payload: Parameters<NoopGraphEventsPublisher['emitToolOutputChunk']>[0]): void {
    this.chunks.push(payload);
  }

  override emitToolOutputTerminal(payload: Parameters<NoopGraphEventsPublisher['emitToolOutputTerminal']>[0]): void {
    this.terminals.push(payload);
  }
}

const createLoggerStub = () =>
  ({
    info: () => undefined,
    debug: () => undefined,
    warn: vi.fn(),
    error: () => undefined,
  }) as unknown as LoggerService;

const baseChunkArgs = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
  seqGlobal: 1,
  seqStream: 1,
  source: 'stdout' as const,
  data: 'hello',
  bytes: 5,
};

const baseTerminalArgs = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
  exitCode: 0,
  status: 'success' as const,
  bytesStdout: 5,
  bytesStderr: 0,
  totalChunks: 1,
  droppedChunks: 0,
  savedPath: null as string | null,
  message: 'done',
};

describe('RunEventsService tool output persistence guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips persistence when Prisma client lacks tool output models', async () => {
    const logger = createLoggerStub();
    const prismaClient = {};
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const publisher = new CapturingPublisher();
    const service = new RunEventsService(prismaService, logger, publisher);

    const chunk = await service.appendToolOutputChunk(baseChunkArgs);
    const terminal = await service.finalizeToolOutputTerminal(baseTerminalArgs);
    const snapshot = await service.getToolOutputSnapshot({ runId: 'run', eventId: 'event' });

    expect(publisher.chunks).toHaveLength(1);
    expect(publisher.terminals).toHaveLength(1);
    expect(chunk.ts).toBeTypeOf('string');
    expect(terminal.droppedChunks).toBe(0);
    expect(snapshot).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool output persistence unavailable: Prisma client is missing tool_output_* models. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
    );
  });

  it('persists when Prisma client exposes tool output models', async () => {
    const logger = createLoggerStub();
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn(async ({ data }: { data: any }) => ({ ...data, id: 'chunk-1', ts: new Date() })),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
      },
      toolOutputTerminal: {
        upsert: vi.fn(async ({ update }: { update: any }) => ({ ...update, eventId: 'event-1', ts: new Date() })),
        findUnique: vi.fn(async () => null),
      },
      runEvent: { findUnique: vi.fn(async () => ({ id: 'event-1', runId: 'run-1', threadId: 'thread-1' })) },
    } as any;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const publisher = new CapturingPublisher();
    const service = new RunEventsService(prismaService, logger, publisher);

    await service.appendToolOutputChunk(baseChunkArgs);
    await service.finalizeToolOutputTerminal(baseTerminalArgs);
    await service.getToolOutputSnapshot({ runId: 'run-1', eventId: 'event-1' });

    expect(prismaClient.toolOutputChunk.create).toHaveBeenCalledOnce();
    expect(prismaClient.toolOutputChunk.findMany).toHaveBeenCalledOnce();
    expect(prismaClient.toolOutputTerminal.upsert).toHaveBeenCalledOnce();
    expect(publisher.chunks).toHaveLength(1);
    expect(publisher.terminals).toHaveLength(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('reports persistence availability state', () => {
    const logger = createLoggerStub();
    const prismaClient = {
      toolOutputChunk: { create: vi.fn() },
      toolOutputTerminal: { upsert: vi.fn() },
    } as const;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const publisher = new CapturingPublisher();

    const missingModelService = new RunEventsService({ getClient: () => ({}) } as PrismaService, logger, publisher);
    expect(missingModelService.isToolOutputPersistenceAvailable()).toBe(false);

    const enabledService = new RunEventsService(prismaService, logger, publisher);
    expect(enabledService.isToolOutputPersistenceAvailable()).toBe(true);
  });
});
