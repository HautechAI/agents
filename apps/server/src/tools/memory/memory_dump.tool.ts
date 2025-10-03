import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, OptionalPathSchemaUI, normalizePathRuntime, isMemoryDebugEnabled } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

// Temporary diagnostic tool: report shallow keys and counts at a path.
export const MemoryDumpToolStaticConfigSchema = z.object({ path: OptionalPathSchemaUI }).strict();

export class MemoryDumpTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryDumpToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw ?? {});
        const factory = this.requireFactory();
        const threadId = runtimeCfg?.configurable?.thread_id;
        const service = factory({ threadId });
        const path = args.path ? normalizePathRuntime(args.path) : '/';

        const dbg = service.getDebugInfo();
        const exists = await service.checkDocExists();
        const stat = await service.stat(path);
        const list = stat.kind === 'dir' || stat.kind === 'file' ? await service.list(path) : [];
        const names = list.map((e) => e.name);
        const files = list.filter((e) => e.kind === 'file').length;
        const dirs = list.filter((e) => e.kind === 'dir').length;

        if (isMemoryDebugEnabled() && this.loggerService) {
          this.loggerService.debug('memory_dump', {
            normalizedPath: path,
            nodeId: dbg.nodeId,
            scope: dbg.scope,
            threadId: dbg.threadId,
            docExists: exists,
            statKind: stat.kind,
            listSize: list.length,
          });
        }

        const payload = {
          nodeId: dbg.nodeId,
          scope: dbg.scope,
          threadId: dbg.threadId,
          path,
          keys: names,
          counts: { total: list.length, files, dirs },
        };
        return JSON.stringify(payload);
      },
      { name: 'memory_dump', description: 'TEMP DIAGNOSTIC: shallow memory listing and metadata (no contents).', schema },
    );
  }
}
