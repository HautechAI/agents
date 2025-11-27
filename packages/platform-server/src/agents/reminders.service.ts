import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';
import { LoggerService } from '../core/services/logger.service';
import { EventsBusService } from '../events/events-bus.service';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import { RemindMeNode } from '../nodes/tools/remind_me/remind_me.node';
import type { RemindMeFunctionTool } from '../nodes/tools/remind_me/remind_me.tool';

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

interface CancelThreadOptions {
  threadId: string;
  includeDescendants?: boolean;
  prismaOverride?: PrismaExecutor;
}

@Injectable()
export class RemindersService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
  ) {}

  async cancelByThread({ threadId, includeDescendants = false, prismaOverride }: CancelThreadOptions): Promise<{
    cancelledDb: number;
    clearedRuntime: number;
    threadIds: string[];
  }> {
    const prisma = prismaOverride ?? this.prismaService.getClient();
    const targetThreadIds = await this.collectTargetThreadIds(prisma, threadId, includeDescendants);
    if (targetThreadIds.length === 0) {
      this.logger.warn('RemindersService cancelByThread: no threads found', { threadId, includeDescendants });
      return { cancelledDb: 0, clearedRuntime: 0, threadIds: [] };
    }

    const cancelledAt = new Date();
    let cancelledDb = 0;
    try {
      const result = await prisma.reminder.updateMany({
        where: {
          threadId: { in: targetThreadIds },
          completedAt: null,
          cancelledAt: null,
        },
        data: { cancelledAt },
      });
      cancelledDb = result.count ?? 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RemindersService persistence update error', {
        threadId,
        includeDescendants,
        error: message,
      });
    }

    const liveNodes = this.safeGetRuntimeNodes(threadId, includeDescendants);
    let clearedRuntime = 0;
    for (const liveNode of liveNodes) {
      if (liveNode.template !== 'remindMeTool') continue;
      const instance = liveNode.instance;
      if (!(instance instanceof RemindMeNode)) continue;
      const tool = instance.getTool() as RemindMeFunctionTool;
      if (typeof tool.clearTimersByThread !== 'function') continue;

      for (const targetId of targetThreadIds) {
        try {
          const clearedIds = tool.clearTimersByThread(targetId);
          clearedRuntime += clearedIds.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn('RemindersService runtime cancellation error', {
            threadId: targetId,
            nodeId: liveNode.id,
            error: message,
          });
        }
      }
    }

    for (const targetId of targetThreadIds) {
      try {
        this.eventsBus.emitThreadMetrics({ threadId: targetId });
        this.eventsBus.emitThreadMetricsAncestors({ threadId: targetId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('RemindersService metrics emission failed', { threadId: targetId, error: message });
      }
    }

    return { cancelledDb, clearedRuntime, threadIds: targetThreadIds };
  }

  private async collectTargetThreadIds(
    prisma: PrismaExecutor,
    rootId: string,
    includeDescendants: boolean,
  ): Promise<string[]> {
    const root = await prisma.thread.findUnique({ where: { id: rootId }, select: { id: true } });
    if (!root) return [];
    if (!includeDescendants) return [root.id];

    const result = new Set<string>([root.id]);
    let frontier: string[] = [root.id];
    while (frontier.length > 0) {
      const batch = frontier;
      frontier = [];
      const children = await prisma.thread.findMany({
        where: { parentId: { in: batch } },
        select: { id: true },
      });
      for (const child of children) {
        if (result.has(child.id)) continue;
        result.add(child.id);
        frontier.push(child.id);
      }
    }
    return Array.from(result);
  }

  private safeGetRuntimeNodes(threadId: string, includeDescendants: boolean) {
    try {
      return this.runtime.getNodes();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RemindersService runtime traversal failed', {
        threadId,
        includeDescendants,
        error: message,
      });
      return [] as Array<{ id: string; template: string; instance: unknown }>;
    }
  }
}
