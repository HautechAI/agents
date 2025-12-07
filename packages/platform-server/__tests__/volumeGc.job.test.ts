import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VolumeGcService } from '../src/infra/container/volumeGc.job';

const envKeys = [
  'VOLUME_GC_ENABLED',
  'VOLUME_GC_MAX_PER_SWEEP',
  'VOLUME_GC_CONCURRENCY',
  'VOLUME_GC_COOLDOWN_MS',
  'VOLUME_GC_INTERVAL_MS',
];

describe('VolumeGcService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  const makeService = () => {
    const prisma = {
      thread: {
        findMany: vi.fn(async () => [] as Array<{ id: string }>),
      },
    };
    const prismaService = { getClient: () => prisma };
    const containerService = {
      listContainersByVolume: vi.fn(async () => [] as string[]),
      removeVolume: vi.fn(async () => undefined),
    };
    const service = new VolumeGcService(prismaService as any, containerService as any);
    return { service, prisma, containerService };
  };

  it('removes volumes with no live references', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-1' }]);

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(containerService.listContainersByVolume).toHaveBeenCalledWith('ha_ws_thread-1');
    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_thread-1', { force: true });
  });

  it('skips volumes still referenced by containers', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-2' }]);
    containerService.listContainersByVolume.mockResolvedValue(['cid-123']);

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(containerService.removeVolume).not.toHaveBeenCalled();
  });

  it('swallows 404 errors when removing volumes', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-3' }]);
    containerService.removeVolume.mockRejectedValueOnce({ statusCode: 404 });

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(containerService.removeVolume).toHaveBeenCalledTimes(1);
  });

  it('honors VOLUME_GC_MAX_PER_SWEEP limit', async () => {
    process.env.VOLUME_GC_MAX_PER_SWEEP = '1';
    const { service, prisma } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-a' }, { id: 'thread-b' }]);

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(prisma.thread.findMany).toHaveBeenCalledWith({
      where: { status: 'closed' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
  });

  it('applies cooldown between attempts for the same thread', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-c' }]);

    const firstTime = new Date('2024-01-01T00:00:00Z');
    await service.sweep(firstTime);

    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-c' }]);
    const secondTime = new Date(firstTime.getTime() + 1_000);
    await service.sweep(secondTime);

    expect(containerService.listContainersByVolume).toHaveBeenCalledTimes(1);
    expect(containerService.removeVolume).toHaveBeenCalledTimes(1);
  });
});
