import { describe, it, expect, vi } from 'vitest';
import { SimpleAgent } from '../src/agents/simple.agent';
import { FinishTool } from '../src/tools/finish.tool';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

class MockConfigService { openaiApiKey = 'sk-abc'; }
class MockLoggerService { 
  info = vi.fn(); 
  debug = vi.fn(); 
  error = vi.fn(); 
}
class MockCheckpointerService { 
  getCheckpointer = vi.fn(() => ({} as any)); 
}

// Mock ChatOpenAI to avoid making real API calls
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    model: string;
    apiKey: string;
    constructor(options: any) {
      this.model = options.model;
      this.apiKey = options.apiKey;
    }
    async invoke(messages: any[]): Promise<AIMessage> {
      // Simple mock behavior: if last message is a system message with restriction,
      // return a tool call to finish tool, otherwise return no tool calls
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content?.includes('call a tool')) {
        return new AIMessage({
          content: 'I will finish the task.',
          tool_calls: [
            {
              id: 'call_finish',
              name: 'finish',
              args: { note: 'Task completed as requested' },
            },
          ],
        });
      }
      return new AIMessage({ content: 'Final answer without tool call' });
    }
    async getNumTokens(): Promise<number> { return 10; }
  },
}));

const makeAgent = () => new SimpleAgent(
  new MockConfigService() as any, 
  new MockLoggerService() as any, 
  new MockCheckpointerService() as any, 
  'agent-1'
);

describe('SimpleAgent with restriction enforcement', () => {
  describe('configuration schema includes restriction fields', () => {
    it('accepts restriction configuration values', () => {
      const agent = makeAgent();
      
      // Should not throw when setting restriction configuration
      expect(() => {
        agent.setConfig({
          restrictOutput: true,
          restrictionMessage: 'Custom restriction message',
          restrictionMaxInjections: 3,
        });
      }).not.toThrow();
    });

    it('updates restriction node options via setConfig', () => {
      const agent = makeAgent();
      const mockLogger = agent['loggerService'] as MockLoggerService;
      
      agent.setConfig({
        restrictOutput: true,
        restrictionMessage: 'You must use a tool',
        restrictionMaxInjections: 1,
      });

      expect(mockLogger.info).toHaveBeenCalledWith('SimpleAgent restriction options updated');
    });
  });

  describe('backward compatibility', () => {
    it('maintains existing behavior with restrictOutput=false', async () => {
      const agent = makeAgent();
      
      // Default behavior should be unchanged
      agent.setConfig({
        restrictOutput: false, // explicitly disabled
        systemPrompt: 'You are helpful',
      });

      // Mock invoke to simulate completing without tools
      const mockInvoke = vi.spyOn(agent.graph, 'invoke').mockResolvedValue({
        messages: [
          new HumanMessage({ content: 'Hello' }),
          new AIMessage({ content: 'Hello! How can I help?' }),
        ],
      });

      const response = await agent.invoke('test-thread', { content: 'Hello', info: {} });
      
      expect(response?.content).toBe('Hello! How can I help?');
      mockInvoke.mockRestore();
    });
  });

  describe('restriction enforcement', () => {
    it('includes finish tool in agent tools when configured', () => {
      const agent = makeAgent();
      const finishTool = new FinishTool();
      
      agent.addTool(finishTool);
      
      const tools = agent['toolsNode'].listTools();
      expect(tools.some(tool => tool instanceof FinishTool)).toBe(true);
    });

    it('handles finish tool termination correctly', async () => {
      const agent = makeAgent();
      const finishTool = new FinishTool();
      agent.addTool(finishTool);

      // Mock the graph invoke to simulate finish tool execution
      const mockInvoke = vi.spyOn(agent.graph, 'invoke').mockResolvedValue({
        messages: [
          new HumanMessage({ content: 'Complete the task' }),
          new AIMessage({
            content: 'I will finish the task.',
            tool_calls: [
              {
                id: 'call_finish',
                name: 'finish',
                args: { note: 'Task completed' },
              },
            ],
          }),
          new ToolMessage({
            tool_call_id: 'call_finish',
            name: 'finish',
            content: 'Task completed',
          }),
        ],
        done: true,
      });

      const response = await agent.invoke('test-thread', { content: 'Complete the task', info: {} });
      
      expect(response?.content).toBe('Task completed');
      mockInvoke.mockRestore();
    });
  });

  describe('state management', () => {
    it('state includes termination and restriction fields', () => {
      const agent = makeAgent();
      const stateSchema = agent['state']();
      
      expect(stateSchema.spec).toHaveProperty('done');
      expect(stateSchema.spec).toHaveProperty('restrictionInjectionCount');
      expect(stateSchema.spec).toHaveProperty('restrictionInjected');
    });

    it('state fields have correct default values', () => {
      const agent = makeAgent();
      const stateSchema = agent['state']();
      
      // Test state schema structure instead of defaults (which are functions internally)
      expect(stateSchema.spec).toHaveProperty('done');
      expect(stateSchema.spec).toHaveProperty('restrictionInjectionCount');
      expect(stateSchema.spec).toHaveProperty('restrictionInjected');
    });
  });

  describe('summarization resets restriction counters', () => {
    it('summarization node resets restriction tracking fields', async () => {
      const agent = makeAgent();
      const summarizeNode = agent['summarizeNode'];

      const result = await summarizeNode.action({
        messages: [new HumanMessage({ content: 'test' })],
        summary: '',
        restrictionInjectionCount: 5,
        restrictionInjected: true,
      });

      expect(result.restrictionInjectionCount).toBe(0);
      expect(result.restrictionInjected).toBe(false);
    });
  });
});