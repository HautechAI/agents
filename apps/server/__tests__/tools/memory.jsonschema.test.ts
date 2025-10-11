import { describe, it, expect } from 'vitest';
import { toJSONSchema } from 'zod';
import { UnifiedMemoryToolStaticConfigSchema } from '../../src/tools/memory/memory.tool';

// Ensure that converting tool schemas to JSON Schema does not throw and produces expected keys

describe('Unified memory tool schema: toJSONSchema', () => {
  it('memory', () => {
    const js = toJSONSchema(UnifiedMemoryToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['path','command']));
    const enumVals = js.properties.command.enum || js.properties.command.anyOf?.flatMap((x: any) => x.enum ?? []);
    expect(enumVals).toEqual(expect.arrayContaining(['read','list','append','update','delete']));
  });
});
