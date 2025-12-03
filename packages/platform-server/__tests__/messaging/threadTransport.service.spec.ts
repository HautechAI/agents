import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ThreadTransportService } from '../../src/messaging/threadTransport.service';
import type { PrismaService } from '../../src/core/services/prisma.service';
import type { LiveGraphRuntime } from '../../src/graph-core/liveGraph.manager';

describe('ThreadTransportService', () => {
  const threadFindUnique = vi.fn();
  const prismaClient = { thread: { findUnique: threadFindUnique } };
  const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
  const getNodeInstance = vi.fn();
  const runtime = { getNodeInstance } as unknown as LiveGraphRuntime;
  let service: ThreadTransportService;

  beforeEach(() => {
    threadFindUnique.mockReset();
    getNodeInstance.mockReset();
    service = new ThreadTransportService(prismaService, runtime);
  });

  it('routes message to channel node when available', async () => {
    threadFindUnique.mockResolvedValue({ channelNodeId: 'node-123' });
    const sendToChannel = vi.fn().mockResolvedValue({ ok: true, threadId: 'thread-1' });
    getNodeInstance.mockReturnValue({ sendToChannel });

    const result = await service.sendTextToThread('thread-1', 'hello world');

    expect(sendToChannel).toHaveBeenCalledWith('thread-1', 'hello world');
    expect(result.ok).toBe(true);
    expect(result.threadId).toBe('thread-1');
  });

  it('returns error when channel node does not implement transport interface', async () => {
    threadFindUnique.mockResolvedValue({ channelNodeId: 'node-unsupported' });
    getNodeInstance.mockReturnValue({});

    const result = await service.sendTextToThread('thread-2', 'message');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('unsupported_channel_node');
  });
});
