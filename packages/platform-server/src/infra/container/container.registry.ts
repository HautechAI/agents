import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../core/services/logger.service';
import type { PrismaClient } from '@prisma/client';

export type ContainerStatus = 'running' | 'stopped' | 'terminating' | 'failed';

type Metadata = {
  labels?: Record<string, string>;
  platform?: string;
  ttlSeconds?: number;
  lastError?: string;
  retryAfter?: string;
  terminationAttempts?: number;
  claimId?: string;
};

@Injectable()
export class ContainerRegistry {
  constructor(
    private prisma: PrismaClient,
    private logger: LoggerService,
  ) {}

  async ensureIndexes(): Promise<void> {
    // No-op: indexes are managed via Prisma migrations
  }

  private computeKillAfter(lastUsedIso: string, ttlSeconds?: number): string | null {
    const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : 86400; // default 24h
    if (ttl <= 0) return null;
    const t = new Date(lastUsedIso).getTime() + ttl * 1000;
    return new Date(t).toISOString();
  }

  async registerStart(args: {
    containerId: string;
    nodeId: string;
    threadId: string;
    image: string;
    providerType?: 'docker';
    labels?: Record<string, string>;
    platform?: string;
    ttlSeconds?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const killAfter = this.computeKillAfter(nowIso, args.ttlSeconds);
    const metadata: Metadata = {
      labels: args.labels || {},
      platform: args.platform,
      ttlSeconds: typeof args.ttlSeconds === 'number' ? args.ttlSeconds : 86400,
    };
    await this.prisma.container.upsert({
      where: { containerId: args.containerId },
      create: {
        containerId: args.containerId,
        nodeId: args.nodeId,
        threadId: args.threadId || null,
        providerType: 'docker',
        image: args.image,
        status: 'running',
        lastUsedAt: new Date(nowIso),
        killAfterAt: killAfter ? new Date(killAfter) : null,
        terminationReason: null,
        deletedAt: null,
        metadata: metadata as any,
      },
      update: {
        nodeId: args.nodeId,
        threadId: args.threadId || null,
        providerType: 'docker',
        image: args.image,
        status: 'running',
        lastUsedAt: new Date(nowIso),
        killAfterAt: killAfter ? new Date(killAfter) : null,
        terminationReason: null,
        deletedAt: null,
        metadata: metadata as any,
      },
    });
  }

  async updateLastUsed(containerId: string, now: Date = new Date(), ttlOverrideSeconds?: number): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return; // do not create missing records
    const meta = (existing.metadata as Metadata | null) || {};
    const ttlMeta = meta.ttlSeconds;
    const ttl = typeof ttlOverrideSeconds === 'number' ? ttlOverrideSeconds : typeof ttlMeta === 'number' ? ttlMeta : 86400;
    const killIso = this.computeKillAfter(now.toISOString(), ttl);
    await this.prisma.container.update({
      where: { containerId },
      data: {
        lastUsedAt: now,
        killAfterAt: killIso ? new Date(killIso) : null,
      },
    });
  }

  async markTerminating(containerId: string, reason: string, claimId?: string): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return;
    const meta = ((existing.metadata as Metadata | null) || {}) as Metadata;
    if (claimId) meta.claimId = claimId;
    await this.prisma.container.update({
      where: { containerId },
      data: {
        status: 'terminating',
        terminationReason: reason,
        metadata: meta as any,
      },
    });
  }

  async markStopped(containerId: string, reason: string): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return;
    await this.prisma.container.update({
      where: { containerId },
      data: { status: 'stopped', deletedAt: new Date(), terminationReason: reason },
    });
  }

  async claimForTermination(containerId: string, claimId: string): Promise<boolean> {
    const res = await this.prisma.container.updateMany({
      where: { containerId, status: 'running' },
      data: { status: 'terminating', metadata: { ...(await this.getMetadata(containerId)), claimId } as any },
    });
    return res.count === 1;
  }

  private async getMetadata(containerId: string): Promise<Metadata> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    return ((existing?.metadata as Metadata | null) || {}) as Metadata;
  }

  async getExpired(now: Date = new Date()) {
    const iso = now.toISOString();
    const terminating = await this.prisma.$queryRaw<Array<{ containerId: string }>>`
      SELECT "containerId" FROM "Container"
      WHERE "status" = 'terminating'
        AND (
          ("metadata" ? 'retryAfter' = false)
          OR (("metadata"->>'retryAfter')::timestamptz <= ${iso}::timestamptz)
        )
    `;
    const running = await this.prisma.container.findMany({
      where: { status: 'running', killAfterAt: { not: null, lte: now } },
    });
    const termDetails = await this.prisma.container.findMany({ where: { containerId: { in: terminating.map((r) => r.containerId) } } });
    return [...running, ...termDetails];
  }

  async recordTerminationFailure(containerId: string, message: string): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return;
    const meta = ((existing.metadata as Metadata | null) || {}) as Metadata;
    const attempts = typeof meta.terminationAttempts === 'number' ? meta.terminationAttempts : 0;
    const nextAttempts = attempts + 1;
    const delayMs = Math.min(Math.pow(2, attempts) * 1000, 15 * 60 * 1000);
    const retryAfterIso = new Date(Date.now() + delayMs).toISOString();
    meta.lastError = message;
    meta.retryAfter = retryAfterIso;
    meta.terminationAttempts = nextAttempts;
    await this.prisma.container.update({ where: { containerId }, data: { metadata: meta as any } });
  }
}
