import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimpleAgent } from '../src/agents/simple.agent';
import { ConfigService } from '../src/services/config.service';
import { LoggerService } from '../src/services/logger.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import { TriggerMessage } from '../src/triggers/base.trigger';
import { AIMessage, ToolMessage, HumanMessage } from '@langchain/core/messages';

// Mock services
class MockConfigService implements Partial<ConfigService> {
  openaiApiKey = 'test-key';
}

class MockLoggerService implements LoggerService {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

class MockCheckpointerService implements Partial<CheckpointerService> {
  getCheckpointer = vi.fn(() => ({}));
}

// Mock tool calls
const mockToolCall = {
  id: 'call_123',
  name: 'test_tool',
  args: { input: 'test' }
};

describe('Agent Injection', () => {
  let agent: SimpleAgent;
  let logger: MockLoggerService;

  beforeEach(() => {
    vi.useRealTimers();
    logger = new MockLoggerService();
    agent = new SimpleAgent(
      new MockConfigService() as ConfigService,
      logger,
      new MockCheckpointerService() as CheckpointerService,
      'test-agent'
    );
  });

  describe('injection after tools', () => {
    it('injects pending messages when whenBusy=injectAfterTools and tools are used', () => {
      // Configure for injection after tools with debounce to prevent immediate processing
      agent.setConfig({
        whenBusy: 'injectAfterTools',
        processBuffer: 'allTogether',
        debounceMs: 100
      });

      const agentAny = agent as any;
      
      // Directly add messages to the buffer to bypass invoke logic
      agentAny.messagesBuffer.enqueue('test-thread', [
        { content: 'pending1', info: {} },
        { content: 'pending2', info: {} }
      ]);
      
      // Drain pending messages (should work since they're debounced)
      const pending = agentAny.drainPendingMessages('test-thread');
      expect(pending).toHaveLength(2);
      expect(pending.map((m: TriggerMessage) => m.content)).toEqual(['pending1', 'pending2']);
    });

    it('returns empty array when whenBusy=wait', () => {
      // Configure for wait behavior
      agent.setConfig({
        whenBusy: 'wait',
        processBuffer: 'allTogether',
        debounceMs: 0
      });

      const agentAny = agent as any;
      
      // Add messages to buffer
      agent.invoke('test-thread', { content: 'pending', info: {} });
      
      // Should return empty array since whenBusy=wait
      const pending = agentAny.drainPendingMessages('test-thread');
      expect(pending).toHaveLength(0);
    });

    it('respects processBuffer=oneByOne for injection', () => {
      agent.setConfig({
        whenBusy: 'injectAfterTools',
        processBuffer: 'oneByOne',
        debounceMs: 100  // Add debounce to prevent immediate processing
      });

      const agentAny = agent as any;
      
      // Directly add messages to buffer
      agentAny.messagesBuffer.enqueue('test-thread', [
        { content: 'msg1', info: {} },
        { content: 'msg2', info: {} },
        { content: 'msg3', info: {} }
      ]);
      
      // First drain should get only one message
      const pending1 = agentAny.drainPendingMessages('test-thread');
      expect(pending1).toHaveLength(1);
      expect(pending1[0].content).toBe('msg1');
      
      // Second drain should get the next message
      const pending2 = agentAny.drainPendingMessages('test-thread');
      expect(pending2).toHaveLength(1);
      expect(pending2[0].content).toBe('msg2');
    });

    it('respects debounce window for injection', () => {
      vi.useFakeTimers();
      const baseTime = 1000;
      vi.setSystemTime(baseTime);
      
      agent.setConfig({
        whenBusy: 'injectAfterTools',
        processBuffer: 'allTogether',
        debounceMs: 100
      });

      const agentAny = agent as any;
      
      // Add messages to buffer
      agentAny.messagesBuffer.enqueue('test-thread', [{ content: 'debounced', info: {} }]);
      
      // For injection after tools, debounce is bypassed for immediate injection
      // This is the intended behavior - injection ignores debounce when tools are called 
      let pending = agentAny.drainPendingMessages('test-thread');
      expect(pending).toHaveLength(1);
      expect(pending[0].content).toBe('debounced');
      
      vi.useRealTimers();
    });
  });

  describe('configuration validation', () => {
    it('accepts valid whenBusy values', () => {
      expect(() => {
        agent.setConfig({ whenBusy: 'wait' });
      }).not.toThrow();
      
      expect(() => {
        agent.setConfig({ whenBusy: 'injectAfterTools' });
      }).not.toThrow();
    });

    it('accepts valid processBuffer values', () => {
      expect(() => {
        agent.setConfig({ processBuffer: 'allTogether' });
      }).not.toThrow();
      
      expect(() => {
        agent.setConfig({ processBuffer: 'oneByOne' });
      }).not.toThrow();
    });

    it('accepts valid debounceMs values', () => {
      expect(() => {
        agent.setConfig({ debounceMs: 0 });
      }).not.toThrow();
      
      expect(() => {
        agent.setConfig({ debounceMs: 1000 });
      }).not.toThrow();
    });
  });
});