import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from '../base.tool';
import { MemoryService } from '../../services/memory.service';
import { LangGraphRunnableConfig } from '@langchain/langgraph';

// Common base to inject a memory service factory into individual memory tools
export abstract class MemoryToolBase extends BaseTool {
  protected serviceFactory: ((opts: { threadId?: string }) => MemoryService) | undefined;

  // Back-compat: previous port wired setMemoryFactory; continue to support.
  setMemoryFactory(factory: (opts: { threadId?: string }) => MemoryService): void {
    this.serviceFactory = factory;
  }

  // Preferred: accept MemoryNode-like or factory directly.
  setMemorySource(source: ((opts: { threadId?: string }) => MemoryService) | { getMemoryService: (opts: { threadId?: string }) => MemoryService }): void {
    if (typeof source === 'function') {
      this.serviceFactory = source as (opts: { threadId?: string }) => MemoryService;
    } else if (source && typeof (source as any).getMemoryService === 'function') {
      this.serviceFactory = (opts: { threadId?: string }) => (source as any).getMemoryService(opts);
    } else {
      throw new Error('Invalid argument to setMemorySource');
    }
  }

  protected requireFactory(): (opts: { threadId?: string }) => MemoryService {
    if (!this.serviceFactory) throw new Error('Memory tool: memory factory not set');
    return this.serviceFactory;
  }

  abstract init(config?: LangGraphRunnableConfig): DynamicStructuredTool;
}

// Shared path schema for memory tools:
// - require non-empty string
// - normalize to have a leading slash
// - forbid ".." and "$" to avoid traversal and Mongo operator conflicts
export const NormalizedPathSchema = z
  .string()
  .min(1, 'path is required')
  .transform((p) => (p.startsWith('/') ? p : '/' + p))
  .refine((p) => !p.includes('..'), 'invalid path: ".." not allowed')
  .refine((p) => !p.includes('$'), 'invalid path: "$" not allowed');
