import { DynamicStructuredTool } from '@langchain/core/tools';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { BaseTool } from './base.tool';
import { TerminateResponse } from './terminateResponse';

export class FinishTool extends BaseTool {
  init(config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'finish',
      description: 'Signal the current task is complete. Call this before ending when output is restricted.',
      schema: z.object({
        note: z.string().optional().describe('Optional note about task completion'),
      }),
      func: async ({ note }) => {
        return new TerminateResponse(note);
      },
    });
  }
}