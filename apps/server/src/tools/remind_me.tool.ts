import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';

const remindMeSchema = z.object({ delayMs: z.number().int().min(0), note: z.string().min(1) });

export class RemindMeTool extends BaseTool {
  constructor(private logger: LoggerService) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (raw, config) => {
        const { delayMs, note } = remindMeSchema.parse(raw);
        const threadId = (config?.configurable as any)?.thread_id as string | undefined;
        const callerAgent = (config?.configurable as any)?.caller_agent as any | undefined;

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
        setTimeout(async () => {
          try {
            await callerAgent.invoke(threadId, [
              { kind: 'system', content: note, info: { reason: 'reminded' } },
            ]);
          } catch (e: any) {
            this.logger.error('RemindMeTool scheduled invoke error', e);
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
