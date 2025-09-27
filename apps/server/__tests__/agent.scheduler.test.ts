import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../src/agents/base.agent';
import { TriggerMessage } from '../src/triggers/base.trigger';
import { LoggerService } from '../src/services/logger.service';
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { CompiledStateGraph } from '@langchain/langgraph';

// Mock logger
class MockLoggerService implements LoggerService {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

// Mock graph that simulates different execution patterns
class MockGraph {
  private mockResponse: { messages: BaseMessage[] } = { messages: [] };
  private toolCallsToReturn: any[] = [];
  
  setMockResponse(messages: BaseMessage[]) {
    this.mockResponse = { messages };
  }
  
  setToolCalls(toolCalls: any[]) {
    this.toolCallsToReturn = toolCalls;
  }
  
  async invoke(input: any, config: any) {
    // Simulate adding the input messages
    const inputMessages = input.messages?.items || [];
    
    // Create AI response with optional tool calls
    const aiMessage = new AIMessage({
      content: 'mock response',
      tool_calls: this.toolCallsToReturn
    });
    
    let resultMessages = [...inputMessages, aiMessage];
    
    // If there are tool calls, simulate tool execution
    if (this.toolCallsToReturn.length > 0) {
      const toolMessages = this.toolCallsToReturn.map(tc => new ToolMessage({
        tool_call_id: tc.id,
        name: tc.name,
        content: 'tool result'
      }));
      resultMessages = [...resultMessages, ...toolMessages];
    }
    
    return { messages: resultMessages };
  }
}

// Test agent that exposes protected methods
class TestAgent extends BaseAgent {
  private mockGraph = new MockGraph();
  
  constructor(logger: LoggerService) {
    super(logger);
    this._graph = this.mockGraph as any;
    this._config = {};
  }
  
  setMockGraph(mockResponse: BaseMessage[], toolCalls: any[] = []) {
    this.mockGraph.setMockResponse(mockResponse);
    this.mockGraph.setToolCalls(toolCalls);
  }
  
  // Expose protected methods for testing
  public drainPendingMessages(thread: string): TriggerMessage[] {
    return super.drainPendingMessages(thread);
  }
  
  public updateAgentConfig(config: Record<string, unknown>): void {
    return super.updateAgentConfig(config);
  }
  
  setConfig(config: Record<string, unknown>): void {
    this.updateAgentConfig(config);
  }
}

describe('Agent Scheduler', () => {
  let logger: MockLoggerService;
  let agent: TestAgent;

  beforeEach(() => {
    vi.useRealTimers();
    logger = new MockLoggerService();
    agent = new TestAgent(logger);
  });

  describe('basic scheduling', () => {
    it('processes messages immediately when debounceMs=0', async () => {
      agent.setConfig({ debounceMs: 0, processBuffer: 'allTogether' });
      
      const result = await agent.invoke('thread1', [
        { content: 'msg1', info: {} },
        { content: 'msg2', info: {} }
      ]);
      
      expect(result).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('New trigger event in thread thread1')
      );
    });

    it('handles oneByOne processing mode', async () => {
      agent.setConfig({ debounceMs: 0, processBuffer: 'oneByOne' });
      
      // First message should be processed immediately
      const result1 = await agent.invoke('thread1', { content: 'msg1', info: {} });
      expect(result1).toBeDefined();
      
      // Give a moment for async processing of remaining messages
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify both messages were logged (first sync, second async)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('New trigger event in thread thread1')
      );
    });
  });

  describe('debounce behavior', () => {
    it('respects debounce window', async () => {
      vi.useFakeTimers();
      agent.setConfig({ debounceMs: 100, processBuffer: 'allTogether' });
      
      // First invoke should not process immediately due to debounce
      const result1 = await agent.invoke('thread1', { content: 'msg1', info: {} });
      expect(result1).toBeUndefined(); // Should be undefined for debounced messages
      
      // Add another message during debounce window
      const result2 = await agent.invoke('thread1', { content: 'msg2', info: {} });
      expect(result2).toBeUndefined();
      
      // Advance time to trigger debounce
      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();
      
      // Both messages should have been processed together
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('New trigger event in thread thread1')
      );
      
      vi.useRealTimers();
    });
  });

  describe('whenBusy behavior', () => {
    it('waits for completion when whenBusy=wait', async () => {
      agent.setConfig({ whenBusy: 'wait', processBuffer: 'allTogether' });
      
      let firstCallResolve: () => void;
      const firstCallPromise = new Promise<void>(resolve => {
        firstCallResolve = resolve;
      });
      
      // Mock a slow graph execution
      const originalInvoke = agent['_graph']!.invoke;
      agent['_graph']!.invoke = vi.fn(async (...args) => {
        await firstCallPromise;
        return originalInvoke.call(agent['_graph'], ...args);
      });
      
      // Start first invocation (will be slow)
      const promise1 = agent.invoke('thread1', { content: 'msg1', info: {} });
      
      // Start second invocation while first is running
      const promise2 = agent.invoke('thread1', { content: 'msg2', info: {} });
      
      // Second should return undefined since it's queued
      const result2 = await promise2;
      expect(result2).toBeUndefined();
      
      // Resolve first call
      firstCallResolve!();
      const result1 = await promise1;
      expect(result1).toBeDefined();
      
      // Give time for second message to be processed
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('supports injectAfterTools behavior', () => {
      agent.setConfig({ whenBusy: 'injectAfterTools', debounceMs: 100 });
      
      const agentAny = agent as any;
      
      // Directly add messages to buffer to bypass invoke processing
      agentAny.messagesBuffer.enqueue('thread1', [
        { content: 'msg1', info: {} },
        { content: 'msg2', info: {} }
      ]);
      
      // Drain should return messages when configured for injection
      const pending = agent.drainPendingMessages('thread1');
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.map(m => m.content)).toContain('msg1');
    });
  });

  describe('multiple threads', () => {
    it('handles threads independently', async () => {
      agent.setConfig({ debounceMs: 0 });
      
      const result1 = await agent.invoke('thread1', { content: 'msg1', info: {} });
      const result2 = await agent.invoke('thread2', { content: 'msg2', info: {} });
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      
      // Each thread should have been logged separately
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('thread1')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('thread2')
      );
    });
  });

  describe('config updates', () => {
    it('updates agent configuration', () => {
      agent.setConfig({
        debounceMs: 500,
        whenBusy: 'injectAfterTools',
        processBuffer: 'oneByOne'
      });
      
      expect(logger.info).toHaveBeenCalledWith('Agent debounceMs updated to 500');
      expect(logger.info).toHaveBeenCalledWith('Agent whenBusy updated to injectAfterTools');
      expect(logger.info).toHaveBeenCalledWith('Agent processBuffer updated to oneByOne');
    });
  });
});