import { describe, it, expect, vi } from 'vitest';
import z from 'zod';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';
import type { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { McpError } from '../src/nodes/mcp/types';
import { Signal } from '../src/signal';
import type { LLMContext } from '../src/llm/types';

const createContext = (): LLMContext => ({
  threadId: 'thread-mcp',
  runId: 'run-mcp',
  finishSignal: new Signal(),
  terminateSignal: new Signal(),
  callerAgent: { invoke: vi.fn() },
});

const createNode = (overrides: Partial<Pick<LocalMCPServerNode, 'callTool'>> = {}) =>
  ({
    config: { namespace: 'demo' },
    callTool: overrides.callTool ?? vi.fn(),
  }) as unknown as LocalMCPServerNode;

describe('LocalMCPServerTool error handling', () => {
  it('throws an McpError with structured message when execution result is flagged as error', async () => {
    const structured = { message: 'patch failed', code: 'E_PATCH', retriable: false };
    const callTool = vi.fn(async () => ({ isError: true, structuredContent: structured }));
    const node = createNode({ callTool });
    const tool = new LocalMCPServerTool('codex_apply_patch', 'Apply patch', z.object({}), node);

    let caught: unknown;
    try {
      await tool.execute({}, createContext());
    } catch (err) {
      caught = err;
    }

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('codex_apply_patch', {}, { threadId: 'thread-mcp' });
    expect(caught).toBeInstanceOf(McpError);
    expect((caught as Error).message).toBe('patch failed (code=E_PATCH retriable=false)');
    expect((caught as Error & { cause?: unknown }).cause).toEqual(structured);
  });

  it('returns structured content when available and falls back to plain content otherwise', async () => {
    const structured = { result: 'ok', instructions: ['a', 'b'] };
    const callTool = vi
      .fn()
      .mockResolvedValueOnce({ isError: false, structuredContent: structured })
      .mockResolvedValueOnce({ isError: false, content: 'plain text' });

    const node = createNode({ callTool });
    const tool = new LocalMCPServerTool('codex_apply_patch', 'Apply patch', z.object({}), node);
    const ctx = createContext();

    const structuredResult = await tool.execute({}, ctx);
    expect(structuredResult).toBe(JSON.stringify(structured));

    const plainResult = await tool.execute({}, ctx);
    expect(plainResult).toBe('plain text');
  });
});
