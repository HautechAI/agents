import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagesBuffer, WhenBusy, ProcessBuffer, ExecutorCallback } from '../src/agents/messagesBuffer';
import { TriggerMessage } from '../src/triggers/base.trigger';

describe('MessagesBuffer', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('debounce behavior', () => {
    it('processes messages immediately when debounceMs = 0', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      await buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      await buffer.enqueue('t1', [{ content: 'b', info: {} }]);

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(2);
      expect(calls[0].messages.map(m => m.content)).toEqual(['a']);
      expect(calls[1].messages.map(m => m.content)).toEqual(['b']);

      buffer.destroy();
    });

    it('debounces messages within window', async () => {
      vi.useFakeTimers();
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 100,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      vi.advanceTimersByTime(50);
      buffer.enqueue('t1', [{ content: 'b', info: {} }]);
      vi.advanceTimersByTime(99); // still not fired
      expect(calls.length).toBe(0);

      vi.advanceTimersByTime(1); // reach 100ms since last
      await Promise.resolve(); // allow microtasks
      expect(calls.length).toBe(1);
      expect(calls[0].messages.map(m => m.content)).toEqual(['a', 'b']);

      buffer.destroy();
      vi.useRealTimers();
    });

    it('resets debounce timer on new messages', async () => {
      vi.useFakeTimers();
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 100,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      vi.advanceTimersByTime(90);
      buffer.enqueue('t1', [{ content: 'b', info: {} }]); // resets timer
      vi.advanceTimersByTime(90); // 90ms from second message
      expect(calls.length).toBe(0);

      vi.advanceTimersByTime(10); // reach 100ms from second message
      await Promise.resolve();
      expect(calls.length).toBe(1);
      expect(calls[0].messages.map(m => m.content)).toEqual(['a', 'b']);

      buffer.destroy();
      vi.useRealTimers();
    });
  });

  describe('whenBusy=wait behavior', () => {
    it('buffers messages while executor is busy', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      let resolveFirst: (() => void) | null = null;
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
        if (!resolveFirst) {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      // First message starts busy executor
      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      await new Promise(resolve => setTimeout(resolve, 1)); // allow first call to start

      // While busy, enqueue more messages
      buffer.enqueue('t1', [{ content: 'b', info: {} }]);
      buffer.enqueue('t1', [{ content: 'c', info: {} }]);
      
      expect(calls.length).toBe(1); // only first batch processed
      expect(calls[0].messages.map(m => m.content)).toEqual(['a']);

      // Resolve first call
      if (resolveFirst) resolveFirst();
      await new Promise(resolve => setTimeout(resolve, 1)); // allow second batch to process

      expect(calls.length).toBe(2);
      expect(calls[1].messages.map(m => m.content)).toEqual(['b', 'c']);

      buffer.destroy();
    });

    it('respects debounce after busy period ends', async () => {
      vi.useFakeTimers();
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      let resolveFirst: (() => void) | null = null;
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
        if (!resolveFirst) {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 50,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      // First message with debounce
      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      vi.advanceTimersByTime(50);
      await Promise.resolve(); // start first execution (busy)

      // While busy, add more messages
      buffer.enqueue('t1', [{ content: 'b', info: {} }]);
      buffer.enqueue('t1', [{ content: 'c', info: {} }]);

      expect(calls.length).toBe(1);

      // Resolve first execution
      if (resolveFirst) resolveFirst();
      await Promise.resolve();

      // Should schedule debounce for buffered messages
      expect(calls.length).toBe(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(calls.length).toBe(2);
      expect(calls[1].messages.map(m => m.content)).toEqual(['b', 'c']);

      buffer.destroy();
      vi.useRealTimers();
    });
  });

  describe('whenBusy=injectAfterTools behavior', () => {
    it('waits for tools phase end when busy', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      let resolveFirst: (() => void) | null = null;
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
        if (!resolveFirst) {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.INJECT_AFTER_TOOLS,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      // First message starts busy executor
      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      await new Promise(resolve => setTimeout(resolve, 1));

      // While busy, enqueue more messages
      buffer.enqueue('t1', [{ content: 'b', info: {} }]);
      
      expect(calls.length).toBe(1);

      // Resolve first execution but don't signal tools phase end yet
      if (resolveFirst) resolveFirst();
      await new Promise(resolve => setTimeout(resolve, 1));

      // Should still be waiting for tools phase
      expect(calls.length).toBe(1);

      // Signal tools phase end
      buffer.onToolsPhaseEnd('t1');
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(2);
      expect(calls[1].messages.map(m => m.content)).toEqual(['b']);

      buffer.destroy();
    });

    it('processes immediately if not waiting for tools phase', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.INJECT_AFTER_TOOLS,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      // When not busy, should process immediately
      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(1);
      expect(calls[0].messages.map(m => m.content)).toEqual(['a']);

      buffer.destroy();
    });

    it('ignores onToolsPhaseEnd when not waiting', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.INJECT_AFTER_TOOLS,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      // Call onToolsPhaseEnd when not waiting - should be no-op
      buffer.onToolsPhaseEnd('t1');
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(0);

      buffer.destroy();
    });
  });

  describe('processBuffer behavior', () => {
    it('processes all messages together with ALL_TOGETHER', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      buffer.enqueue('t1', [
        { content: 'a', info: {} },
        { content: 'b', info: {} },
        { content: 'c', info: {} },
      ]);
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(1);
      expect(calls[0].messages.map(m => m.content)).toEqual(['a', 'b', 'c']);

      buffer.destroy();
    });

    it('processes messages one by one with ONE_BY_ONE', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ONE_BY_ONE,
      });

      buffer.enqueue('t1', [
        { content: 'a', info: {} },
        { content: 'b', info: {} },
        { content: 'c', info: {} },
      ]);
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(3);
      expect(calls[0].messages.map(m => m.content)).toEqual(['a']);
      expect(calls[1].messages.map(m => m.content)).toEqual(['b']);
      expect(calls[2].messages.map(m => m.content)).toEqual(['c']);

      buffer.destroy();
    });

    it('maintains FIFO order with ONE_BY_ONE', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ONE_BY_ONE,
      });

      // Enqueue in multiple batches
      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      buffer.enqueue('t1', [{ content: 'b', info: {} }]);
      buffer.enqueue('t1', [{ content: 'c', info: {} }]);
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(3);
      expect(calls[0].messages.map(m => m.content)).toEqual(['a']);
      expect(calls[1].messages.map(m => m.content)).toEqual(['b']);
      expect(calls[2].messages.map(m => m.content)).toEqual(['c']);

      buffer.destroy();
    });
  });

  describe('thread isolation', () => {
    it('processes different threads independently', async () => {
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 0,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      buffer.enqueue('t2', [{ content: 'b', info: {} }]);
      await new Promise(resolve => setTimeout(resolve, 1));

      expect(calls.length).toBe(2);
      expect(calls.find(c => c.thread === 't1')?.messages.map(m => m.content)).toEqual(['a']);
      expect(calls.find(c => c.thread === 't2')?.messages.map(m => m.content)).toEqual(['b']);

      buffer.destroy();
    });

    it('debounces per thread independently', async () => {
      vi.useFakeTimers();
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 100,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      vi.advanceTimersByTime(50);
      buffer.enqueue('t2', [{ content: 'b', info: {} }]);
      vi.advanceTimersByTime(50); // t1 timer fires, t2 still has 50ms left

      await vi.advanceTimersByTimeAsync(0); // Allow timer callbacks to execute
      expect(calls.length).toBe(1);
      expect(calls[0].thread).toBe('t1');

      vi.advanceTimersByTime(50); // t2 timer fires
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.length).toBe(2);
      expect(calls[1].thread).toBe('t2');

      buffer.destroy();
      vi.useRealTimers();
    });
  });

  describe('destroy', () => {
    it('clears all timers and state', async () => {
      vi.useFakeTimers();
      const calls: Array<{ thread: string; messages: TriggerMessage[] }> = [];
      const executor: ExecutorCallback = async (thread, messages) => {
        calls.push({ thread, messages });
      };

      const buffer = new MessagesBuffer(executor, {
        debounceMs: 100,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      });

      buffer.enqueue('t1', [{ content: 'a', info: {} }]);
      buffer.enqueue('t2', [{ content: 'b', info: {} }]);

      // Destroy before timers fire
      buffer.destroy();

      vi.advanceTimersByTime(100);
      await vi.advanceTimersByTimeAsync(0);

      expect(calls.length).toBe(0); // No messages should have been processed

      vi.useRealTimers();
    });
  });
});