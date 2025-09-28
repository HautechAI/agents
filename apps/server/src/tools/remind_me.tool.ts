import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';

const remindMeSchema = z.object({ delayMs: z.number().int().min(0), note: z.string().min(1) });

// Minimal interface for the caller agent used by this tool
interface CallerAgentLike {
  invoke(thread: string, messages: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>): Promise<unknown>;
}

export class RemindMeTool extends BaseTool {
  private lastTimeout?: ReturnType<typeof setTimeout>; // useful for tests/cleanup
  constructor(private logger: LoggerService) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (raw, config) => {
        const { delayMs, note } = remindMeSchema.parse(raw);
        // Guarded extraction of configurable context
        const cfg = (config && typeof config === 'object' ? (config as Record<string, unknown>).configurable : undefined) as
          | Record<string, unknown>
          | undefined;
        const threadId = cfg && typeof cfg.thread_id === 'string' ? (cfg.thread_id as string) : undefined;
        const callerAgent = cfg && typeof cfg.caller_agent === 'object' && cfg.caller_agent !== null ? (cfg.caller_agent as CallerAgentLike) : undefined;

        if (!threadId) {
          const msg = 'RemindMeTool error: missing thread_id in runtime config.';
          this.logger.error(msg);
          return msg;
        }
        if (!callerAgent || typeof callerAgent.invoke !== 'function') {
          const msg = 'RemindMeTool error: missing caller_agent in runtime config.';
          this.logger.error(msg);
          return msg;
        }

        // Schedule async reminder; do not await or reject the original call.
        this.lastTimeout = setTimeout(async () => {
          try {
            await callerAgent.invoke(threadId, [
              { kind: 'system', content: note, info: { reason: 'reminded' } },
            ]);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown error');
            this.logger.error('RemindMeTool scheduled invoke error', err);
          }
        }, delayMs);

        const eta = new Date(Date.now() + delayMs).toISOString();
        return { status: 'scheduled', etaMs: delayMs, at: eta };
      },
      {
        name: 'remindMeTool',
        description:
          'Schedule a reminder message to self after a delay. Useful for time-based follow-ups. Async-only; returns immediately with schedule info.',
        schema: remindMeSchema,
      },
    );
  }
}

export const RemindMeToolStaticConfigSchema = z.object({}).strict();
