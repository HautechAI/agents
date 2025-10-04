import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from './base.tool';
import { TerminateResponse } from './terminateResponse';
import { LoggerService } from '../services/logger.service';

const finishSchema = z.object({ note: z.string().optional() });

export class FinishTool extends BaseTool {
  constructor(logger: LoggerService) { super(logger); }
  init(): DynamicStructuredTool {
    return tool(
      async (raw) => {
        const { note } = finishSchema.parse(raw);
        return new TerminateResponse(note);
      },
      {
        name: 'finish',
        description:
          'Signal the current task is complete. Call this before ending when output is restricted.',
        schema: finishSchema,
      },
    );
  }
}

export const FinishToolStaticConfigSchema = z.object({}).strict();
