import { TriggerMessage } from '../triggers/base.trigger';

export enum ProcessBuffer {
  OneByOne = 'oneByOne',
  AllTogether = 'allTogether',
}

export interface MessagesBufferOptions {
  debounceMs?: number;
}

type ThreadState = {
  queue: TriggerMessage[];
  lastEnqueueAt: number;
};

/**
 * Pull-based buffer owned by Agent. Triggers enqueue, Agent drains.
 */
export class MessagesBuffer {
  private debounceMs: number;
  private threads: Map<string, ThreadState> = new Map();

  constructor(opts?: MessagesBufferOptions) {
    this.debounceMs = Math.max(0, opts?.debounceMs ?? 0);
  }

  setDebounceMs(ms: number) {
    // Use Math.trunc to avoid bitwise coercion pitfalls and preserve large values
    this.debounceMs = Math.max(0, Math.trunc(ms));
  }

  enqueue(thread: string, msgs: TriggerMessage[] | TriggerMessage, now = Date.now()): void {
    const batch = Array.isArray(msgs) ? msgs : [msgs];
    if (!batch.length) return;
    const s = this.ensure(thread);
    s.queue.push(...batch);
    s.lastEnqueueAt = now;
  }

  tryDrain(thread: string, mode: ProcessBuffer, now = Date.now()): TriggerMessage[] {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return [];
    if (this.debounceMs > 0 && now - s.lastEnqueueAt < this.debounceMs) return [];
    if (mode === ProcessBuffer.AllTogether) {
      const out = s.queue.slice();
      s.queue.length = 0;
      return out;
    } else {
      return [s.queue.shift()!];
    }
  }

  nextReadyAt(thread: string, now = Date.now()): number | undefined {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return undefined;
    if (this.debounceMs === 0) return now;
    return s.lastEnqueueAt + this.debounceMs;
  }

  destroy(): void {
    this.threads.clear();
  }

  private ensure(thread: string): ThreadState {
    let s = this.threads.get(thread);
    if (!s) {
      s = { queue: [], lastEnqueueAt: 0 };
      this.threads.set(thread, s);
    }
    return s;
  }
}
