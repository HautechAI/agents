import { beforeEach, afterEach, describe, expect, it, vi, type SpyInstance } from 'vitest';
import { RunEventsService } from '../src/events/run-events.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import { Logger } from '@nestjs/common';

const baseChunkArgs = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
  seqGlobal: 1,
  seqStream: 1,
  source: 'stdout' as const,
  data: 'chunk-1',
  bytes: 7,
};

const baseTerminalArgs = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
  exitCode: 0,
  status: 'success' as const,
  bytesStdout: 10,
  bytesStderr: 0,
  totalChunks: 1,
  droppedChunks: 0,
  savedPath: null as string | null,
  message: 'ok',
};

describe('RunEventsService tool output persistence resilience', () => {
  let warnSpy: SpyInstance;
  let debugSpy: SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('logs once and continues streaming when chunk persistence fails', async () => {
    const chunkError = new Error('relation "tool_output_chunk" does not exist');
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockRejectedValue(chunkError),
      },
      toolOutputTerminal: {
        upsert: vi.fn(),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    const first = await service.appendToolOutputChunk(baseChunkArgs);
    const second = await service.appendToolOutputChunk({ ...baseChunkArgs, seqGlobal: 2, seqStream: 2, data: 'chunk-2' });

    expect(first.data).toBe('chunk-1');
    expect(second.data).toBe('chunk-2');
    expect(prismaClient.toolOutputChunk.create).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Tool output chunk persistence failed. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
      expect.objectContaining({ eventId: 'event-1', runId: 'run-1' }),
    );
  });

  it('logs once and continues terminal signaling when terminal persistence fails', async () => {
    const terminalError = new Error('missing tool_output_terminal table');
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockResolvedValue({ ...baseChunkArgs, ts: new Date() }),
      },
      toolOutputTerminal: {
        upsert: vi.fn().mockRejectedValue(terminalError),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    const first = await service.finalizeToolOutputTerminal(baseTerminalArgs);
    const second = await service.finalizeToolOutputTerminal({ ...baseTerminalArgs, exitCode: 1, status: 'failed' });

    expect(first.status).toBe('success');
    expect(second.status).toBe('failed');
    expect(prismaClient.toolOutputTerminal.upsert).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Tool output terminal persistence failed. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
      expect.objectContaining({ eventId: 'event-1', runId: 'run-1' }),
    );
  });

  it('logs once and rethrows when snapshot retrieval fails', async () => {
    const snapshotError = new Error('tool_output_chunk not found');
    const prismaClient = {
      runEvent: {
        findUnique: vi.fn().mockRejectedValue(snapshotError),
      },
      toolOutputChunk: {
        findMany: vi.fn(),
      },
      toolOutputTerminal: {
        findUnique: vi.fn(),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    await expect(
      service.getToolOutputSnapshot({ runId: 'run-1', eventId: 'event-1' }),
    ).rejects.toThrowError(snapshotError);
    await expect(
      service.getToolOutputSnapshot({ runId: 'run-1', eventId: 'event-1' }),
    ).rejects.toThrowError(snapshotError);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Tool output snapshot retrieval failed. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
      expect.objectContaining({ eventId: 'event-1', runId: 'run-1' }),
    );
  });

  it('decodes UTF-16LE chunk data with BOM before persisting', async () => {
    const now = new Date();
    const utf16leBuffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Hello', 'utf16le')]);
    const rawData = utf16leBuffer.toString('binary');
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          expect(data.data).toBe('Hello');
          return {
            eventId: data.eventId,
            seqGlobal: data.seqGlobal,
            seqStream: data.seqStream,
            source: data.source,
            data: data.data,
            ts: now,
          };
        }),
      },
      toolOutputTerminal: {
        upsert: vi.fn(),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    const result = await service.appendToolOutputChunk({ ...baseChunkArgs, data: rawData });

    expect(result.data).toBe('Hello');
    expect(debugSpy).toHaveBeenCalledWith(
      'Sanitized tool output for Postgres compatibility',
      expect.objectContaining({
        runId: 'run-1',
        eventId: 'event-1',
        field: 'chunk.data',
        transcodedEncoding: 'utf16le',
        strippedNullCount: 0,
      }),
    );
  });

  it('decodes UTF-16BE chunk data with BOM before persisting', async () => {
    const now = new Date();
    const leBody = Buffer.from('Hello', 'utf16le');
    const beBody = Buffer.alloc(leBody.length);
    for (let i = 0; i < leBody.length; i += 2) {
      beBody[i] = leBody[i + 1]!;
      beBody[i + 1] = leBody[i]!;
    }
    const utf16beBuffer = Buffer.concat([Buffer.from([0xfe, 0xff]), beBody]);
    const rawData = utf16beBuffer.toString('binary');
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          expect(data.data).toBe('Hello');
          return {
            eventId: data.eventId,
            seqGlobal: data.seqGlobal,
            seqStream: data.seqStream,
            source: data.source,
            data: data.data,
            ts: now,
          };
        }),
      },
      toolOutputTerminal: {
        upsert: vi.fn(),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    const result = await service.appendToolOutputChunk({ ...baseChunkArgs, data: rawData });

    expect(result.data).toBe('Hello');
    expect(debugSpy).toHaveBeenCalledWith(
      'Sanitized tool output for Postgres compatibility',
      expect.objectContaining({
        runId: 'run-1',
        eventId: 'event-1',
        field: 'chunk.data',
        transcodedEncoding: 'utf16be',
        strippedNullCount: 0,
      }),
    );
  });

  it('strips null bytes from chunk data before persisting', async () => {
    const now = new Date();
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          expect(data.data).toBe('abcdef');
          return {
            eventId: data.eventId,
            seqGlobal: data.seqGlobal,
            seqStream: data.seqStream,
            source: data.source,
            data: data.data,
            ts: now,
          };
        }),
      },
      toolOutputTerminal: {
        upsert: vi.fn(),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    const result = await service.appendToolOutputChunk({ ...baseChunkArgs, data: 'abc\u0000def' });

    expect(result.data).toBe('abcdef');
    expect(debugSpy).toHaveBeenCalledWith(
      'Sanitized tool output for Postgres compatibility',
      expect.objectContaining({
        runId: 'run-1',
        eventId: 'event-1',
        field: 'chunk.data',
        strippedNullCount: 1,
        transcodedEncoding: null,
      }),
    );
  });

  it('strips null bytes from terminal message before persisting', async () => {
    const now = new Date();
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockResolvedValue({
          eventId: baseChunkArgs.eventId,
          seqGlobal: baseChunkArgs.seqGlobal,
          seqStream: baseChunkArgs.seqStream,
          source: baseChunkArgs.source,
          data: baseChunkArgs.data,
          ts: now,
        }),
      },
      toolOutputTerminal: {
        upsert: vi.fn().mockImplementation(async ({ create }) => {
          expect(create.message).toBe('badnews');
          return {
            eventId: create.eventId,
            exitCode: create.exitCode,
            status: create.status,
            bytesStdout: create.bytesStdout,
            bytesStderr: create.bytesStderr,
            totalChunks: create.totalChunks,
            droppedChunks: create.droppedChunks,
            savedPath: create.savedPath,
            message: create.message,
            ts: now,
          };
        }),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    const result = await service.finalizeToolOutputTerminal({
      ...baseTerminalArgs,
      message: 'bad\u0000news',
    });

    expect(result.message).toBe('badnews');
    expect(debugSpy).toHaveBeenCalledWith(
      'Sanitized tool output for Postgres compatibility',
      expect.objectContaining({
        runId: 'run-1',
        eventId: 'event-1',
        field: 'terminal.message',
        strippedNullCount: 1,
        transcodedEncoding: null,
      }),
    );
  });
});
