import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MemoryEntry as PrismaMemoryEntry, PrismaClient, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/services/prisma.service';
import type { MemoryEntry, MemoryFilter } from './memory.types';

export type EntryMutation<T> =
  | { type: 'noop'; result?: T }
  | { type: 'delete'; result?: T }
  | { type: 'upsert'; content: string; result?: T };

export interface MemoryEntriesRepositoryPort {
  withEntry<T>(
    filter: MemoryFilter,
    path: string,
    meta: { parentPath: string; depth: number },
    fn: (entry: MemoryEntry | null) => Promise<EntryMutation<T>> | EntryMutation<T>,
  ): Promise<T>;
  getEntry(filter: MemoryFilter, path: string): Promise<MemoryEntry | null>;
  listFiles(filter: MemoryFilter, parentPath: string): Promise<MemoryEntry[]>;
  listDescendantParentPaths(filter: MemoryFilter, path: string): Promise<string[]>;
  hasDescendants(filter: MemoryFilter, path: string): Promise<boolean>;
  deleteTree(filter: MemoryFilter, path: string): Promise<Array<Pick<MemoryEntry, 'path' | 'parentPath' | 'depth'>>>;
  listAll(filter: MemoryFilter): Promise<MemoryEntry[]>;
}

export const GLOBAL_THREAD_KEY = '__global__';

@Injectable()
export class PostgresMemoryEntriesRepository implements MemoryEntriesRepositoryPort {
  constructor(@Inject(PrismaService) private readonly prismaSvc: PrismaService) {}

  private async getClient(): Promise<PrismaClient> {
    return this.prismaSvc.getClient();
  }

  private normalizeThreadId(filter: MemoryFilter): string {
    if (filter.scope === 'perThread') {
      if (!filter.threadId || filter.threadId.trim().length === 0) throw new Error('threadId required for perThread scope');
      return filter.threadId;
    }
    return GLOBAL_THREAD_KEY;
  }

  private rowToEntry(row: MemoryEntryRow): MemoryEntry {
    return {
      nodeId: row.node_id,
      scope: row.scope as MemoryEntry['scope'],
      threadId: row.thread_id,
      path: row.path,
      parentPath: row.parent_path,
      depth: row.depth,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private prismaToEntry(row: PrismaMemoryEntry): MemoryEntry {
    return {
      nodeId: row.nodeId,
      scope: row.scope,
      threadId: row.threadId,
      path: row.path,
      parentPath: row.parentPath,
      depth: row.depth,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async selectForUpdate(filter: MemoryFilter, path: string, tx: Prisma.TransactionClient): Promise<MemoryEntryRow | null> {
    const threadKey = this.normalizeThreadId(filter);
    const rows = await tx.$queryRaw<MemoryEntryRow[]>`
      SELECT id, node_id, scope, thread_id, path, parent_path, depth, content, created_at, updated_at
      FROM memory_entries
      WHERE node_id = ${filter.nodeId}
        AND scope = ${filter.scope}::"MemoryScope"
        AND thread_id = ${threadKey}
        AND path = ${path}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async withEntry<T>(
    filter: MemoryFilter,
    path: string,
    meta: { parentPath: string; depth: number },
    fn: (entry: MemoryEntry | null) => Promise<EntryMutation<T>> | EntryMutation<T>,
  ): Promise<T> {
    const prisma = await this.getClient();
    const threadKey = this.normalizeThreadId(filter);
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await this.selectForUpdate(filter, path, tx);
      const current = row ? this.rowToEntry(row) : null;
      const mutation = await fn(current);
      if (!mutation || mutation.type === 'noop') {
        return (mutation?.result ?? undefined) as T;
      }
      if (mutation.type === 'delete') {
        if (current) {
          await tx.$executeRaw`
            DELETE FROM memory_entries
            WHERE node_id = ${filter.nodeId}
              AND scope = ${filter.scope}::"MemoryScope"
              AND thread_id = ${threadKey}
              AND path = ${path}
          `;
        }
        return (mutation.result ?? undefined) as T;
      }

      if (mutation.type === 'upsert') {
        if (current) {
          await tx.$executeRaw`
            UPDATE memory_entries
            SET content = ${mutation.content}, parent_path = ${meta.parentPath}, depth = ${meta.depth}, updated_at = NOW()
            WHERE node_id = ${filter.nodeId}
              AND scope = ${filter.scope}::"MemoryScope"
              AND thread_id = ${threadKey}
              AND path = ${path}
          `;
        } else {
          const newId = randomUUID();
          await tx.$executeRaw`
            INSERT INTO memory_entries (id, node_id, scope, thread_id, path, parent_path, depth, content, created_at, updated_at)
            VALUES (${newId}::uuid, ${filter.nodeId}, ${filter.scope}::"MemoryScope", ${threadKey}, ${path}, ${meta.parentPath}, ${meta.depth}, ${mutation.content}, NOW(), NOW())
          `;
        }
        return (mutation.result ?? undefined) as T;
      }

      throw new Error('Unsupported entry mutation type');
    });
  }

  async getEntry(filter: MemoryFilter, path: string): Promise<MemoryEntry | null> {
    const prisma = await this.getClient();
    const threadKey = this.normalizeThreadId(filter);
    const row = await prisma.memoryEntry.findUnique({
      where: {
        nodeId_scope_threadId_path: {
          nodeId: filter.nodeId,
          scope: filter.scope,
          threadId: threadKey,
          path,
        },
      },
    });
    if (!row) return null;
    return this.prismaToEntry(row);
  }

  async listFiles(filter: MemoryFilter, parentPath: string): Promise<MemoryEntry[]> {
    const prisma = await this.getClient();
    const threadKey = this.normalizeThreadId(filter);
    const rows = await prisma.memoryEntry.findMany({
      where: {
        nodeId: filter.nodeId,
        scope: filter.scope,
        threadId: threadKey,
        parentPath,
      },
      orderBy: { path: 'asc' },
    });
    return rows.map((row) => this.prismaToEntry(row));
  }

  async listDescendantParentPaths(filter: MemoryFilter, path: string): Promise<string[]> {
    const prisma = await this.getClient();
    const threadKey = this.normalizeThreadId(filter);
    const pattern = path === '/' ? '/%' : `${path}/%`;
    const rows = await prisma.$queryRaw<Array<{ parent_path: string }>>`
      SELECT DISTINCT parent_path
      FROM memory_entries
      WHERE node_id = ${filter.nodeId}
        AND scope = ${filter.scope}::"MemoryScope"
        AND thread_id = ${threadKey}
        AND parent_path LIKE ${pattern}
    `;
    return rows
      .map((row) => row.parent_path)
      .filter((p) => p !== path);
  }

  async hasDescendants(filter: MemoryFilter, path: string): Promise<boolean> {
    const prisma = await this.getClient();
    const threadKey = this.normalizeThreadId(filter);
    const prefix = path === '/' ? '/' : `${path}/`;
    const row = await prisma.memoryEntry.findFirst({
      where: {
        nodeId: filter.nodeId,
        scope: filter.scope,
        threadId: threadKey,
        path: {
          startsWith: prefix,
        },
      },
      select: { id: true },
    });
    return !!row;
  }

  async deleteTree(filter: MemoryFilter, path: string): Promise<Array<Pick<MemoryEntry, 'path' | 'parentPath' | 'depth'>>> {
    const prisma = await this.getClient();
    const threadKey = this.normalizeThreadId(filter);
    if (path === '/') {
      const rows = await prisma.$queryRaw<Array<{ path: string; parent_path: string; depth: number }>>`
        DELETE FROM memory_entries
        WHERE node_id = ${filter.nodeId}
          AND scope = ${filter.scope}::"MemoryScope"
          AND thread_id = ${threadKey}
        RETURNING path, parent_path, depth
      `;
      return rows.map((row) => ({ path: row.path, parentPath: row.parent_path, depth: row.depth }));
    }

    const prefix = `${path}/%`;
    const rows = await prisma.$queryRaw<Array<{ path: string; parent_path: string; depth: number }>>`
      DELETE FROM memory_entries
      WHERE node_id = ${filter.nodeId}
        AND scope = ${filter.scope}::"MemoryScope"
        AND thread_id = ${threadKey}
        AND (path = ${path} OR path LIKE ${prefix})
      RETURNING path, parent_path, depth
    `;
    return rows.map((row) => ({ path: row.path, parentPath: row.parent_path, depth: row.depth }));
  }

  async listAll(filter: MemoryFilter): Promise<MemoryEntry[]> {
    const prisma = await this.getClient();
    const threadKey = this.normalizeThreadId(filter);
    const rows = await prisma.memoryEntry.findMany({
      where: {
        nodeId: filter.nodeId,
        scope: filter.scope,
        threadId: threadKey,
      },
      orderBy: { path: 'asc' },
    });
    return rows.map((row) => this.prismaToEntry(row));
  }
}

type MemoryEntryRow = {
  id: string;
  node_id: string;
  scope: 'global' | 'perThread';
  thread_id: string;
  path: string;
  parent_path: string;
  depth: number;
  content: string;
  created_at: Date;
  updated_at: Date;
};
