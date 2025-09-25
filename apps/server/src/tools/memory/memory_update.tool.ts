import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from '../base.tool';
import { LoggerService } from '../../services/logger.service';

export class MemoryUpdateTool extends BaseTool {
  private ms: unknown;
  constructor(private logger: LoggerService) { super(); }
  setMemoryService(ms: unknown) { this.ms = ms; }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'memory_update',
      description: 'Update data at memory path',
      schema: z.object({ path: z.string(), old_data: z.any(), new_data: z.any() }),
      func: async (_input) => {
        return 'not implemented';
      },
    });
  }
}
