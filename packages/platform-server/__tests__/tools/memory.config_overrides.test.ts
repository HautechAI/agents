import { describe, it, expect } from 'vitest';
import { UnifiedMemoryFunctionTool as UnifiedMemoryTool } from '../../src/graph/nodes/tools/memory/memory.tool';
import { MemoryToolNodeStaticConfigSchema as UnifiedMemoryToolNodeStaticConfigSchema, MemoryToolNode } from '../../src/graph/nodes/tools/memory/memory.node';
import { LoggerService } from '../../src/core/services/logger.service';
import { TemplateRegistry } from '../../src/graph/templateRegistry';
import { toJSONSchema } from 'zod';
// Note: schema below tests node-level config, not function tool input schema.

describe('UnifiedMemoryTool config overrides and templates exposure', () => {
  it('applies name/description overrides and keeps defaults', async () => {
    // New API: config applied at node level; tool pulls metadata from node
    const logger = new LoggerService();
    const node = new MemoryToolNode(logger as any);
    await node.setConfig({ description: 'Custom desc' });
    const tool = node.getTool();
    expect(tool.name).toBe('memory');
    expect(tool.description).toBe('Custom desc');

    await node.setConfig({ name: 'mem_x', description: 'Custom desc' });
    const tool2 = node.getTool();
    expect(tool2.name).toBe('mem_x');
    expect(tool2.description).toBe('Custom desc');
  });

  it('rejects invalid name via schema', async () => {
    const logger = new LoggerService();
    const node = new MemoryToolNode(logger as any);
    await expect(node.setConfig({ name: 'Bad-Name' })).rejects.toThrow();
    const tool = node.getTool();
    expect(tool.name).toBe('memory');
  });

  it('templates expose node-level static config schema', () => {
    const js = toJSONSchema(UnifiedMemoryToolNodeStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['name','description','title']));
  });
});
