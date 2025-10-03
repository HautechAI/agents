import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, PathSchemaUI, normalizePathRuntime, isMemoryDebugEnabled } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryReadToolStaticConfigSchema = z.object({ path: PathSchemaUI }).strict();

export class MemoryReadTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryReadToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        this.loggerService?.info('Tool called', 'memory_read', { args });
        const factory = this.requireFactory();
        const threadId = runtimeCfg?.configurable?.thread_id;
        const service = factory({ threadId });
        const path = normalizePathRuntime(args.path);

        if (isMemoryDebugEnabled()) {
          const dbg = service.getDebugInfo();
          const exists = await service.checkDocExists();
          const st = await service.stat(path);
          this.loggerService?.debug('memory_read debug', {
            normalizedPath: path,
            nodeId: dbg.nodeId,
            scope: dbg.scope,
            threadId: dbg.threadId,
            docExists: exists,
            statKind: st.kind,
            // do not log content
          });
        }

        const content = await service.read(path);
        if (isMemoryDebugEnabled()) {
          this.loggerService?.debug('memory_read result', {
            length: typeof content === 'string' ? content.length : 0,
          });
        }
        return content;
      },
      { name: 'memory_read', description: 'Read memory file content', schema },
    );
  }
}
