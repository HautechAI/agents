import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from '../base.tool';
import { LoggerService } from '../../services/logger.service';
import { MemoryService } from '../../services/memory.service';

export class MemoryUpdateTool extends BaseTool {
  private ms?: MemoryService;
  constructor(private logger: LoggerService) { super(); }
  setMemoryService(ms: unknown) { this.ms = ms as MemoryService; }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'memory_update',
      description: 'Update data at memory path',
      schema: z.object({ path: z.string(), old_data: z.string(), new_data: z.string() }),
      func: async ({ path, old_data, new_data }) => {
        if (!this.ms) throw new Error('MemoryService not set');
        const res = await this.ms.update(path, old_data, new_data);
        return res as any;
      },
    });
  }
}
