import type { FastifyInstance } from 'fastify';
import type { LiveGraphRuntime } from '../graph/liveGraph.manager';
import type { LoggerService } from '../services/logger.service';
import type { RemindMeTool, ActiveReminder } from '../tools/remind_me.tool';

function isRemindMeTool(x: unknown): x is RemindMeTool {
  return !!x && typeof (x as any).getActiveReminders === 'function';
}

export function registerRemindersRoute(fastify: FastifyInstance, runtime: LiveGraphRuntime, _logger: LoggerService) {
  // List active reminders for a given nodeId (RemindMe tool)
  fastify.get('/graph/nodes/:nodeId/reminders', async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string };
    try {
      const inst = (runtime as any).getNodeInstance?.(nodeId) || (runtime as any)['getNodeInstance']?.(nodeId);
      if (!inst) {
        reply.code(404);
        return { error: 'node_not_found' };
      }
      if (!isRemindMeTool(inst)) {
        reply.code(404);
        return { error: 'not_remindme_node' };
      }
      const items: ActiveReminder[] = inst.getActiveReminders();
      return { items };
    } catch (e: any) {
      reply.code(500);
      return { error: e?.message || 'reminders_error' };
    }
  });
}
