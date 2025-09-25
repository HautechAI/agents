import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { MemoryReadTool } from '../src/tools/memory/memory_read.tool';
import { MemoryListTool } from '../src/tools/memory/memory_list.tool';
import { MemoryAppendTool } from '../src/tools/memory/memory_append.tool';
import { MemoryUpdateTool } from '../src/tools/memory/memory_update.tool';
import { MemoryDeleteTool } from '../src/tools/memory/memory_delete.tool';

const logger = new LoggerService();

function runTool(tool: any, input: any) {
  const cfg: LangGraphRunnableConfig = { configurable: { thread_id: 't' } } as any;
  const dynamic = tool.init(cfg);
  return dynamic.invoke(input, cfg as any);
}

describe('Memory tool stubs', () => {
  it('memory_read returns exists=false for missing', async () => {
    const t = new MemoryReadTool(logger);
    t.setMemoryService({ stat: async () => ({ exists: false, kind: 'missing' }) } as any);
    const out = await runTool(t, { path: '/a' });
    expect(out.exists).toBe(false);
  });

  it('memory_list returns array', async () => {
    const t = new MemoryListTool(logger);
    t.setMemoryService({ list: async () => [] } as any);
    const out = await runTool(t, { path: '/a' });
    expect(Array.isArray(out)).toBe(true);
  });

  it('memory_append returns ok:true', async () => {
    const t = new MemoryAppendTool(logger);
    t.setMemoryService({ stat: async () => ({ exists: true, kind: 'file' }), append: async () => {} } as any);
    const out = await runTool(t, { path: '/a', data: {} });
    expect(out.ok).toBe(true);
  });

  it('memory_update returns count', async () => {
    const t = new MemoryUpdateTool(logger);
    t.setMemoryService({ update: async () => ({ updated: 1 }) } as any);
    const out = await runTool(t, { path: '/a', old_data: {}, new_data: {} });
    expect(out.updated).toBe(1);
  });

  it('memory_delete returns count', async () => {
    const t = new MemoryDeleteTool(logger);
    t.setMemoryService({ delete: async () => ({ deleted: 1 }) } as any);
    const out = await runTool(t, { path: '/a' });
    expect(out.deleted).toBe(1);
  });
});
