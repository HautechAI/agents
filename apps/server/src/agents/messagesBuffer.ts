import { TriggerMessage } from '../triggers/base.trigger';

export interface MessagesBufferOptions {
  debounceMs?: number;
}

interface ThreadState {
  queue: TriggerMessage[];
  lastEnqueueAt: number;
}

export class MessagesBuffer {
  private threads: Map<string, ThreadState> = new Map();
  private readonly debounceMs: number;

  constructor(options: MessagesBufferOptions = {}) {
    this.debounceMs = options.debounceMs ?? 0;
  }

  /**
   * Enqueue messages for a thread
   */
  enqueue(thread: string, messages: TriggerMessage[]): void {
    if (messages.length === 0) return;
    
    const now = Date.now();
    let state = this.threads.get(thread);
    if (!state) {
      state = { queue: [], lastEnqueueAt: now };
      this.threads.set(thread, state);
    }
    
    state.queue.push(...messages);
    state.lastEnqueueAt = now;
  }

  /**
   * Try to drain messages from a thread's queue
   * Returns messages if debounce window has elapsed, empty array otherwise
   */
  tryDrain(thread: string, mode: 'allTogether' | 'oneByOne', now: number = Date.now()): TriggerMessage[] {
    const state = this.threads.get(thread);
    if (!state || state.queue.length === 0) {
      return [];
    }

    // Check debounce window
    if (this.debounceMs > 0 && now - state.lastEnqueueAt < this.debounceMs) {
      return [];
    }

    // Return messages based on mode
    if (mode === 'allTogether') {
      const messages = state.queue.slice();
      state.queue = [];
      return messages;
    } else { // oneByOne
      const message = state.queue.shift();
      return message ? [message] : [];
    }
  }

  /**
   * Returns timestamp when debounce window elapses for a thread, or null if nothing queued
   */
  nextReadyAt(thread: string): number | null {
    const state = this.threads.get(thread);
    if (!state || state.queue.length === 0) {
      return null;
    }
    
    if (this.debounceMs === 0) {
      return Date.now(); // ready immediately
    }
    
    return state.lastEnqueueAt + this.debounceMs;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.threads.clear();
  }
}