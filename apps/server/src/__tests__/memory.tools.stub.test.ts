import { describe, it, expect } from 'vitest';
import { LoggerService } from '../services/logger.service';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { MemoryReadTool } from '../tools/memory/memory_read.tool';
import { MemoryListTool } from '../tools/memory/memory_list.tool';
import { MemoryAppendTool } from '../tools/memory/memory_append.tool';
import { MemoryUpdateTool } from '../tools/memory/memory_update.tool';
import { MemoryDeleteTool } from '../tools/memory/memory_delete.tool';

const logger = new LoggerService();

function runTool(tool: any, input: any) {
  const cfg: LangGraphRunnableConfig = { configurable: { thread_id: 't' } } as any;
  const dynamic = tool.init(cfg);
  return dynamic.invoke(input, cfg as any);
}

describe('Memory tool stubs', () => {
  it('memory_read returns placeholder', async () => {
    const t = new MemoryReadTool(logger);
    t.setMemoryService({});
    const out = await runTool(t, { path: '/a' });
    expect(typeof out).toBe('string');
  });

  it('memory_list returns placeholder', async () => {
    const t = new MemoryListTool(logger);
    t.setMemoryService({});
    const out = await runTool(t, { path: '/a' });
    expect(typeof out).toBe('string');
  });

  it('memory_append returns placeholder', async () => {
    const t = new MemoryAppendTool(logger);
    t.setMemoryService({});
    const out = await runTool(t, { path: '/a', data: {} });
    expect(typeof out).toBe('string');
  });

  it('memory_update returns placeholder', async () => {
    const t = new MemoryUpdateTool(logger);
    t.setMemoryService({});
    const out = await runTool(t, { path: '/a', old_data: {}, new_data: {} });
    expect(typeof out).toBe('string');
  });

  it('memory_delete returns placeholder', async () => {
    const t = new MemoryDeleteTool(logger);
    t.setMemoryService({});
    const out = await runTool(t, { path: '/a' });
    expect(typeof out).toBe('string');
  });
});
