import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, NormalizedPathSchema } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryAppendToolStaticConfigSchema = z.object({}).strict();

export class MemoryAppendTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    // Normalize path (prepend leading slash when missing) and validate early via zod
    const schema = z.object({ path: NormalizedPathSchema, data: z.string() });
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        await service.append(args.path, args.data);
        return 'ok';
      },
      { name: 'memory_append', description: 'Append string to memory file', schema },
    );
  }
}
