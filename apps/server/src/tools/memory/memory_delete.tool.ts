import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from '../base.tool';
import { LoggerService } from '../../services/logger.service';

export class MemoryDeleteTool extends BaseTool {
  private ms: unknown;
  constructor(private logger: LoggerService) { super(); }
  setMemoryService(ms: unknown) { this.ms = ms; }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'memory_delete',
      description: 'Delete data at memory path',
      schema: z.object({ path: z.string() }),
      func: async (_input) => {
        return 'not implemented';
      },
    });
  }
}
