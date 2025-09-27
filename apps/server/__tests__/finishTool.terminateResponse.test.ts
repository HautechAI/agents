import { describe, it, expect, vi } from 'vitest';
import { FinishTool } from '../src/tools/finish.tool';
import { TerminateResponse } from '../src/tools/terminateResponse';
import { ToolsNode } from '../src/nodes/tools.node';
import { AIMessage, ToolMessage } from '@langchain/core/messages';

describe('TerminateResponse and FinishTool', () => {
  describe('TerminateResponse', () => {
    it('creates instance with optional message', () => {
      const response1 = new TerminateResponse();
      expect(response1.message).toBeUndefined();

      const response2 = new TerminateResponse('Task completed successfully');
      expect(response2.message).toBe('Task completed successfully');
    });
  });

  describe('FinishTool', () => {
    it('returns TerminateResponse when invoked', async () => {
      const finishTool = new FinishTool();
      const tool = finishTool.init();
      
      expect(tool.name).toBe('finish');
      expect(tool.description).toContain('Signal the current task is complete');

      const result = await tool.invoke({ note: 'All done!' });
      expect(result).toBeInstanceOf(TerminateResponse);
      expect((result as TerminateResponse).message).toBe('All done!');
    });

    it('works without note parameter', async () => {
      const finishTool = new FinishTool();
      const tool = finishTool.init();

      const result = await tool.invoke({});
      expect(result).toBeInstanceOf(TerminateResponse);
      expect((result as TerminateResponse).message).toBeUndefined();
    });
  });

  describe('ToolsNode handles TerminateResponse', () => {
    it('sets done=true when tool returns TerminateResponse', async () => {
      const finishTool = new FinishTool();
      const toolsNode = new ToolsNode([finishTool]);

      const aiMessage = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            name: 'finish',
            args: { note: 'Task completed' },
          },
        ],
      });

      const result = await toolsNode.action(
        { messages: [aiMessage] },
        { configurable: { thread_id: 'test' } }
      );

      expect(result.done).toBe(true);
      expect(result.messages?.method).toBe('append');
      expect(result.messages?.items).toHaveLength(1);
      
      const toolMessage = result.messages?.items[0] as ToolMessage;
      expect(toolMessage.content).toBe('Task completed');
      expect(toolMessage.tool_call_id).toBe('call_1');
      expect(toolMessage.name).toBe('finish');
    });

    it('uses default message when TerminateResponse has no message', async () => {
      const finishTool = new FinishTool();
      const toolsNode = new ToolsNode([finishTool]);

      const aiMessage = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            name: 'finish',
            args: {},
          },
        ],
      });

      const result = await toolsNode.action(
        { messages: [aiMessage] },
        { configurable: { thread_id: 'test' } }
      );

      expect(result.done).toBe(true);
      const toolMessage = result.messages?.items[0] as ToolMessage;
      expect(toolMessage.content).toBe('Task completed.');
    });

    it('does not set done=true for non-terminating tools', async () => {
      // Mock a regular tool that returns a string
      const mockTool = {
        init: () => ({
          name: 'regular_tool',
          description: 'A regular tool',
          invoke: vi.fn().mockResolvedValue('Tool result'),
        }),
      };

      const toolsNode = new ToolsNode([mockTool as any]);

      const aiMessage = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            name: 'regular_tool',
            args: {},
          },
        ],
      });

      const result = await toolsNode.action(
        { messages: [aiMessage] },
        { configurable: { thread_id: 'test' } }
      );

      expect(result.done).toBeUndefined();
      expect(result.messages?.method).toBe('append');
      expect(result.messages?.items).toHaveLength(1);
      
      const toolMessage = result.messages?.items[0] as ToolMessage;
      expect(toolMessage.content).toBe('Tool result');
    });
  });
});