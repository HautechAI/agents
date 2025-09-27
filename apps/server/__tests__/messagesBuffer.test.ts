import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagesBuffer } from '../src/agents/messagesBuffer';
import { TriggerMessage } from '../src/triggers/base.trigger';

const createMessage = (content: string): TriggerMessage => ({ content, info: {} });

describe('MessagesBuffer', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('enqueues and drains messages without debounce', () => {
      const buffer = new MessagesBuffer();
      
      buffer.enqueue('thread1', [createMessage('msg1'), createMessage('msg2')]);
      const drained = buffer.tryDrain('thread1', 'allTogether');
      
      expect(drained).toHaveLength(2);
      expect(drained.map(m => m.content)).toEqual(['msg1', 'msg2']);
      
      // Queue should be empty after drain
      const secondDrain = buffer.tryDrain('thread1', 'allTogether');
      expect(secondDrain).toHaveLength(0);
    });

    it('returns empty array for non-existent thread', () => {
      const buffer = new MessagesBuffer();
      const drained = buffer.tryDrain('nonexistent', 'allTogether');
      expect(drained).toHaveLength(0);
    });

    it('handles empty message arrays', () => {
      const buffer = new MessagesBuffer();
      buffer.enqueue('thread1', []);
      const drained = buffer.tryDrain('thread1', 'allTogether');
      expect(drained).toHaveLength(0);
    });
  });

  describe('debounce behavior', () => {
    it('respects debounce window - returns empty before window expires', () => {
      vi.useFakeTimers();
      const baseTime = 1000;
      vi.setSystemTime(baseTime);
      
      const buffer = new MessagesBuffer({ debounceMs: 100 });
      
      buffer.enqueue('thread1', [createMessage('msg1')]);
      
      // Try to drain at 50ms after enqueue - should return empty
      let drained = buffer.tryDrain('thread1', 'allTogether', baseTime + 50);
      expect(drained).toHaveLength(0);
      
      // Try to drain at 99ms - should still return empty
      drained = buffer.tryDrain('thread1', 'allTogether', baseTime + 99);
      expect(drained).toHaveLength(0);
      
      // Try to drain at 100ms - should return messages
      drained = buffer.tryDrain('thread1', 'allTogether', baseTime + 100);
      expect(drained).toHaveLength(1);
      expect(drained[0].content).toBe('msg1');
      
      vi.useRealTimers();
    });

    it('resets debounce window on new enqueue', () => {
      vi.useFakeTimers();
      const baseTime = 1000;
      vi.setSystemTime(baseTime);
      
      const buffer = new MessagesBuffer({ debounceMs: 100 });
      
      // Enqueue at time 0
      buffer.enqueue('thread1', [createMessage('msg1')]);
      
      // Enqueue more at time 50
      vi.setSystemTime(baseTime + 50);
      buffer.enqueue('thread1', [createMessage('msg2')]);
      
      // Try to drain at time 100 (50ms after last enqueue) - should return empty
      let drained = buffer.tryDrain('thread1', 'allTogether', baseTime + 100);
      expect(drained).toHaveLength(0);
      
      // Try to drain at time 150 (100ms after last enqueue) - should return all messages
      drained = buffer.tryDrain('thread1', 'allTogether', baseTime + 150);
      expect(drained).toHaveLength(2);
      expect(drained.map(m => m.content)).toEqual(['msg1', 'msg2']);
      
      vi.useRealTimers();
    });
  });

  describe('processBuffer modes', () => {
    it('allTogether mode returns all messages at once', () => {
      const buffer = new MessagesBuffer();
      
      buffer.enqueue('thread1', [createMessage('msg1'), createMessage('msg2'), createMessage('msg3')]);
      const drained = buffer.tryDrain('thread1', 'allTogether');
      
      expect(drained).toHaveLength(3);
      expect(drained.map(m => m.content)).toEqual(['msg1', 'msg2', 'msg3']);
      
      // Queue should be empty
      const secondDrain = buffer.tryDrain('thread1', 'allTogether');
      expect(secondDrain).toHaveLength(0);
    });

    it('oneByOne mode returns one message at a time', () => {
      const buffer = new MessagesBuffer();
      
      buffer.enqueue('thread1', [createMessage('msg1'), createMessage('msg2'), createMessage('msg3')]);
      
      // First drain gets one message
      let drained = buffer.tryDrain('thread1', 'oneByOne');
      expect(drained).toHaveLength(1);
      expect(drained[0].content).toBe('msg1');
      
      // Second drain gets next message
      drained = buffer.tryDrain('thread1', 'oneByOne');
      expect(drained).toHaveLength(1);
      expect(drained[0].content).toBe('msg2');
      
      // Third drain gets last message
      drained = buffer.tryDrain('thread1', 'oneByOne');
      expect(drained).toHaveLength(1);
      expect(drained[0].content).toBe('msg3');
      
      // Fourth drain returns empty
      drained = buffer.tryDrain('thread1', 'oneByOne');
      expect(drained).toHaveLength(0);
    });
  });

  describe('nextReadyAt', () => {
    it('returns null for empty thread', () => {
      const buffer = new MessagesBuffer({ debounceMs: 100 });
      expect(buffer.nextReadyAt('thread1')).toBeNull();
    });

    it('returns current time when debounceMs is 0', () => {
      const buffer = new MessagesBuffer({ debounceMs: 0 });
      buffer.enqueue('thread1', [createMessage('msg1')]);
      
      const readyAt = buffer.nextReadyAt('thread1');
      expect(readyAt).not.toBeNull();
      expect(readyAt).toBeLessThanOrEqual(Date.now());
    });

    it('returns correct timestamp when debounceMs > 0', () => {
      vi.useFakeTimers();
      const buffer = new MessagesBuffer({ debounceMs: 100 });
      
      const enqueueTime = 1000;
      vi.setSystemTime(enqueueTime);
      buffer.enqueue('thread1', [createMessage('msg1')]);
      
      const readyAt = buffer.nextReadyAt('thread1');
      expect(readyAt).toBe(enqueueTime + 100);
      
      vi.useRealTimers();
    });

    it('returns null after queue is drained', () => {
      const buffer = new MessagesBuffer({ debounceMs: 100 });
      buffer.enqueue('thread1', [createMessage('msg1')]);
      
      expect(buffer.nextReadyAt('thread1')).not.toBeNull();
      
      buffer.tryDrain('thread1', 'allTogether', Date.now() + 100);
      expect(buffer.nextReadyAt('thread1')).toBeNull();
    });
  });

  describe('multiple threads', () => {
    it('handles multiple threads independently', () => {
      vi.useFakeTimers();
      const baseTime = 1000;
      vi.setSystemTime(baseTime);
      
      const buffer = new MessagesBuffer({ debounceMs: 100 });
      
      // Enqueue to thread1 at time 0
      buffer.enqueue('thread1', [createMessage('msg1')]);
      
      // Enqueue to thread2 at time 50 (later)
      vi.setSystemTime(baseTime + 50);
      buffer.enqueue('thread2', [createMessage('msg2')]);
      
      // thread1 should be ready first
      const ready1 = buffer.nextReadyAt('thread1');
      const ready2 = buffer.nextReadyAt('thread2');
      
      expect(ready1).not.toBeNull();
      expect(ready2).not.toBeNull();
      expect(ready1!).toBeLessThan(ready2!);
      
      // Drain thread1 only
      const drained1 = buffer.tryDrain('thread1', 'allTogether', ready1!);
      expect(drained1).toHaveLength(1);
      expect(drained1[0].content).toBe('msg1');
      
      // thread2 should still have messages
      const drained2Early = buffer.tryDrain('thread2', 'allTogether', ready2! - 1);
      expect(drained2Early).toHaveLength(0);
      
      const drained2 = buffer.tryDrain('thread2', 'allTogether', ready2!);
      expect(drained2).toHaveLength(1);
      expect(drained2[0].content).toBe('msg2');
      
      vi.useRealTimers();
    });
  });

  describe('destroy', () => {
    it('clears all threads', () => {
      const buffer = new MessagesBuffer();
      
      buffer.enqueue('thread1', [createMessage('msg1')]);
      buffer.enqueue('thread2', [createMessage('msg2')]);
      
      expect(buffer.nextReadyAt('thread1')).not.toBeNull();
      expect(buffer.nextReadyAt('thread2')).not.toBeNull();
      
      buffer.destroy();
      
      expect(buffer.nextReadyAt('thread1')).toBeNull();
      expect(buffer.nextReadyAt('thread2')).toBeNull();
    });
  });
});