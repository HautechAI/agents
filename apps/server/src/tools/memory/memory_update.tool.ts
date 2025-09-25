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
      schema: z.object({ path: z.string(), old_data: z.any(), new_data: z.any() }),
      func: async (input) => {
        if (!this.ms) throw new Error('MemoryService not set');
        const res = await this.ms.update(input.path, (input as any).old_data, (input as any).new_data);
        return res as any;
      },
    });
  }
}
