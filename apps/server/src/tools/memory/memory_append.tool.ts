import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from '../base.tool';
import { LoggerService } from '../../services/logger.service';
import { MemoryService } from '../../services/memory.service';

export class MemoryAppendTool extends BaseTool {
  private ms?: MemoryService;
  constructor(private logger: LoggerService) { super(); }
  setMemoryService(ms: unknown) { this.ms = ms as MemoryService; }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'memory_append',
      description: 'Append to list at memory path',
      schema: z.object({ path: z.string(), data: z.string() }),
      func: async ({ path, data }) => {
        if (!this.ms) throw new Error('MemoryService not set');
        const st = await this.ms.stat(path);
        if (st.kind === 'dir') throw new Error('Cannot append to a directory');
        await this.ms.append(path, data);
        return { ok: true } as any;
      },
    });
  }
}
