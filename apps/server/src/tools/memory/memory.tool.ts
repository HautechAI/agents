import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, normalizePathRuntime, isMemoryDebugEnabled } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

export const UnifiedMemoryToolStaticConfigSchema = z
  .object({
    path: z.string().describe('Absolute or relative path; normalized at runtime'),
    command: z.enum(['read', 'list', 'append', 'update', 'delete']).describe('Memory command to execute'),
    content: z.string().optional().describe('Content for append or update (new content)'),
    oldContent: z.string().optional().describe('Old content to replace for update'),
  })
  .strict();

type Cmd = z.infer<typeof UnifiedMemoryToolStaticConfigSchema>['command'];

export class UnifiedMemoryTool extends MemoryToolBase {
  constructor(logger: LoggerService) {
    super(logger);
  }

  private makeEnvelope(command: Cmd, path: string, ok: boolean, result?: any, error?: { message: string; code?: string }) {
    const base: any = { command, path, ok };
    if (ok) base.result = result;
    else base.error = error;
    return JSON.stringify(base);
  }

  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = UnifiedMemoryToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        // Validate and normalize inputs
        const args = schema.parse(raw);
        const command = args.command as Cmd;
        let path = args.path;
        try {
          path = normalizePathRuntime(path);
        } catch (e: any) {
          return this.makeEnvelope(command, path || '/', false, undefined, { message: e?.message || 'invalid path', code: 'EINVAL' });
        }

        // Treat empty path as '/' for list to preserve optional behavior
        if (command === 'list' && (!path || path === '')) path = '/';

        const threadId = runtimeCfg?.configurable?.thread_id;
        let service: any;
        try {
          const factory = this.requireFactory();
          service = factory({ threadId });
        } catch (e: any) {
          return this.makeEnvelope(command, path, false, undefined, { message: e?.message || 'memory not connected', code: 'ENOTMEM' });
        }

        if (isMemoryDebugEnabled()) {
          const dbg = service.getDebugInfo?.();
          this.logger.debug('memory tool invoke', { command, path, threadId, nodeId: dbg?.nodeId, scope: dbg?.scope });
        }

        try {
          switch (command) {
            case 'read': {
              const content = await service.read(path);
              return this.makeEnvelope(command, path, true, { content });
            }
            case 'list': {
              const entries = await service.list(path || '/');
              return this.makeEnvelope(command, path, true, { entries });
            }
            case 'append': {
              if (typeof args.content !== 'string') {
                return this.makeEnvelope(command, path, false, undefined, { message: 'content is required for append', code: 'EINVAL' });
              }
              await service.append(path, args.content);
              return this.makeEnvelope(command, path, true, { status: 'ok' });
            }
            case 'update': {
              if (typeof args.content !== 'string' || typeof args.oldContent !== 'string') {
                return this.makeEnvelope(command, path, false, undefined, { message: 'oldContent and content are required for update', code: 'EINVAL' });
              }
              const replaced = await service.update(path, args.oldContent, args.content);
              return this.makeEnvelope(command, path, true, { replaced });
            }
            case 'delete': {
              const res = await service.delete(path);
              return this.makeEnvelope(command, path, true, { files: res.files, dirs: res.dirs });
            }
            default:
              return this.makeEnvelope(command, path, false, undefined, { message: `unknown command: ${String(command)}`, code: 'EINVAL' });
          }
        } catch (e: any) {
          const msg = e?.message || 'error';
          // Attempt to pass through well-known codes in message
          let code: string | undefined = undefined;
          if (/ENOENT/.test(msg)) code = 'ENOENT';
          else if (/EISDIR/.test(msg)) code = 'EISDIR';
          return this.makeEnvelope(command, path, false, undefined, { message: msg, code });
        }
      },
      { name: 'memory', description: 'Unified Memory tool: read, list, append, update, delete', schema },
    );
  }
}
