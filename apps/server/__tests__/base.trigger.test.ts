import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseTrigger, TriggerMessage } from '../src/triggers/base.trigger';

// Concrete test subclass exposing protected notify
class TestTrigger extends BaseTrigger {
  constructor() {
    super();
  }
  emit(thread: string, messages: TriggerMessage[]) {
    return this.notify(thread, messages);
  }
}

describe('BaseTrigger', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('delivers immediately without any buffering', async () => {
    const trigger = new TestTrigger();
    const received: { thread: string; messages: TriggerMessage[] }[] = [];
    await trigger.subscribe({
      invoke: async (thread, messages) => {
        received.push({ thread, messages });
      },
    });
    await trigger.emit('t1', [{ content: 'a', info: {} }]);
    expect(received.length).toBe(1);
    expect(received[0].messages.map((m) => m.content)).toEqual(['a']);
  });

  it('delivers multiple messages immediately', async () => {
    const trigger = new TestTrigger();
    const received: TriggerMessage[][] = [];
    await trigger.subscribe({
      invoke: async (_thread, messages) => {
        received.push(messages);
      },
    });
    
    // First emit
    await trigger.emit('t1', [{ content: 'a', info: {} }]);
    expect(received.length).toBe(1);
    expect(received[0].map((m) => m.content)).toEqual(['a']);
    
    // Second emit - should be delivered immediately as separate batch
    await trigger.emit('t1', [{ content: 'b', info: {} }]);
    expect(received.length).toBe(2);
    expect(received[1].map((m) => m.content)).toEqual(['b']);
  });

  it('supports multiple listeners', async () => {
    const trigger = new TestTrigger();
    const received1: string[] = [];
    const received2: string[] = [];
    
    await trigger.subscribe({
      invoke: async (_thread, messages) => {
        received1.push(...messages.map(m => m.content));
      },
    });
    
    await trigger.subscribe({
      invoke: async (_thread, messages) => {
        received2.push(...messages.map(m => m.content));
      },
    });
    
    await trigger.emit('t1', [{ content: 'test', info: {} }]);
    
    expect(received1).toEqual(['test']);
    expect(received2).toEqual(['test']);
  });

  it('handles multiple threads independently', async () => {
    const trigger = new TestTrigger();
    const received: Array<{ thread: string; content: string }> = [];
    
    await trigger.subscribe({
      invoke: async (thread, messages) => {
        for (const msg of messages) {
          received.push({ thread, content: msg.content });
        }
      },
    });
    
    await trigger.emit('thread1', [{ content: 'msg1', info: {} }]);
    await trigger.emit('thread2', [{ content: 'msg2', info: {} }]);
    
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ thread: 'thread1', content: 'msg1' });
    expect(received[1]).toEqual({ thread: 'thread2', content: 'msg2' });
  });
});
