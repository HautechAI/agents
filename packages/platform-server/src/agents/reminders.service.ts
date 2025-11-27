import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';
import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import { RemindMeNode } from '../nodes/tools/remind_me/remind_me.node';
import type { RemindMeFunctionTool } from '../nodes/tools/remind_me/remind_me.tool';

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

interface CancelThreadRemindersOptions {
  threadId: string;
  prismaOverride?: PrismaExecutor;
}

@Injectable()
export class RemindersService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
  ) {}

  async cancelThreadReminders({ threadId, prismaOverride }: CancelThreadRemindersOptions): Promise<{
    cancelledDb: number;
    clearedRuntime: number;
  }> {
    const prisma = prismaOverride ?? this.prismaService.getClient();
    const cancelledAt = new Date();

    let cancelledDb = 0;
    try {
      const result = await prisma.reminder.updateMany({
        where: { threadId, completedAt: null, cancelledAt: null },
        data: { cancelledAt },
      });
      cancelledDb = result.count ?? 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RemindersService persistence update error', { threadId, error: message });
    }

    let clearedRuntime = 0;
    for (const liveNode of this.safeGetRuntimeNodes(threadId)) {
      if (liveNode.template !== 'remindMeTool') continue;
      const instance = liveNode.instance;
      if (!(instance instanceof RemindMeNode)) continue;
      const tool = instance.getTool() as RemindMeFunctionTool;
      if (typeof tool.clearTimersByThread !== 'function') continue;

      try {
        const clearedIds = tool.clearTimersByThread(threadId);
        clearedRuntime += clearedIds.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('RemindersService runtime cancellation error', {
          threadId,
          nodeId: liveNode.id,
          error: message,
        });
      }
    }

    return { cancelledDb, clearedRuntime };
  }

  private safeGetRuntimeNodes(threadId: string) {
    try {
      return this.runtime.getNodes();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RemindersService runtime traversal failed', { threadId, error: message });
      return [] as Array<{ id: string; template: string; instance: unknown }>;
    }
  }
}
