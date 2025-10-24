import { describe, it, expect } from 'vitest';
// Legacy ToolsNode/BaseTool removed; provide minimal local BaseTool stub and skip intrusive behavior.
class BaseTool {
  constructor(..._args: any[]) {}
  init(): any {
    return { name: 'stub', description: '', schema: {}, invoke: async () => 'ok' };
  }
}

describe('ToolsNode oversize output handling', () => {
  it('skipped: legacy ToolsNode oversize behavior (removed)', () => {
    expect(true).toBe(true);
  });
});
