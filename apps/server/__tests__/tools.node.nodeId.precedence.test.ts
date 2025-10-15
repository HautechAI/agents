import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { ToolsNode } from '../src/lgnodes/tools.lgnode';
import { BaseTool } from '../src/tools/base.tool';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';

// Mock obs-sdk to capture attributes passed to withToolCall
vi.mock('@hautech/obs-sdk', () => {
  const captured: any[] = [];
  class ToolCallResponse<TRaw = unknown, TOutput = unknown> {
    raw: TRaw;
    output?: TOutput;
    status: 'success' | 'error';
    constructor(params: { raw: TRaw; output?: TOutput; status: 'success' | 'error' }) {
      this.raw = params.raw;
      this.output = params.output;
      this.status = params.status;
    }
  }
  const withToolCall = async (attrs: any, fn: any) => {
    captured.push(attrs);
    const res = await fn();
    return (res as any).raw; // return raw ToolMessage like real impl
  };
  return { withToolCall, ToolCallResponse, __test: { captured } } as any;
});

class EchoTool extends BaseTool {
  init(): DynamicStructuredTool {
    return tool(async (raw) => `echo:${JSON.stringify(raw)}`,
      { name: 'echo', description: 'echo tool', schema: ({} as any) },
    );
  }
}

describe('ToolsNode nodeId precedence for withToolCall', () => {
  it('uses config.configurable.nodeId when provided (Tool node id)', async () => {
    const node = new ToolsNode([new EchoTool()], 'agent-node-id');
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'echo', args: { x: 1 } }] } as any);
    const config = { configurable: { thread_id: 't1', nodeId: 'tool-node-id' } } as any;
    const res = await node.action({ messages: [ai] } as any, config);
    expect(res.done).toBeFalsy();
    const obs: any = await import('@hautech/obs-sdk');
    const captured = (obs as any).__test.captured as any[];
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0].nodeId).toBe('tool-node-id');
  });

  it('falls back to agent node id when config nodeId is absent', async () => {
    const obs: any = await import('@hautech/obs-sdk');
    (obs as any).__test.captured.length = 0; // reset captured

    const node = new ToolsNode([new EchoTool()], 'agent-node-id');
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '2', name: 'echo', args: { y: 2 } }] } as any);
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't2' } } as any);
    expect(res.done).toBeFalsy();
    const captured = (obs as any).__test.captured as any[];
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0].nodeId).toBe('agent-node-id');
  });
});

