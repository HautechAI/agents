import { TriggerMessage } from '../triggers/base.trigger';

export enum WhenBusy {
  WAIT = 'wait',
  INJECT_AFTER_TOOLS = 'injectAfterTools',
}

export enum ProcessBuffer {
  ONE_BY_ONE = 'oneByOne',
  ALL_TOGETHER = 'allTogether',
}

export interface MessagesBufferOptions {
  debounceMs?: number;
  whenBusy: WhenBusy;
  processBuffer: ProcessBuffer;
}

interface ThreadState {
  buffer: TriggerMessage[];
  busy: boolean;
  timer?: NodeJS.Timeout;
  waitingForToolsPhase?: boolean; // used for injectAfterTools behavior
}

export type ExecutorCallback = (thread: string, messages: TriggerMessage[]) => Promise<any>;

export class MessagesBuffer {
  private readonly debounceMs: number;
  private readonly whenBusy: WhenBusy;
  private readonly processBuffer: ProcessBuffer;
  private readonly threads: Map<string, ThreadState> = new Map();

  constructor(
    private readonly executor: ExecutorCallback,
    options: MessagesBufferOptions,
  ) {
    this.debounceMs = options.debounceMs ?? 0;
    this.whenBusy = options.whenBusy;
    this.processBuffer = options.processBuffer;
  }

  /**
   * Enqueue messages for a thread. Applies debounce and whenBusy logic.
   */
  async enqueue(thread: string, messages: TriggerMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const state = this.ensureThreadState(thread);
    
    if (state.busy) {
      // When busy, always buffer messages regardless of debounce setting
      state.buffer.push(...messages);
      
      if (this.whenBusy === WhenBusy.WAIT) {
        // Messages will be processed after current run completes
        return;
      } else if (this.whenBusy === WhenBusy.INJECT_AFTER_TOOLS) {
        // Mark that we need to wait for tools phase to complete
        state.waitingForToolsPhase = true;
        return;
      }
    }

    if (this.debounceMs > 0) {
      // Debounce mode: buffer messages and schedule flush
      state.buffer.push(...messages);
      this.scheduleFlush(thread);
    } else {
      // Immediate mode: process each enqueue call separately
      this.executeMessages(thread, messages);
    }
  }

  /**
   * Called by the agent when the tools phase completes for injectAfterTools behavior.
   */
  onToolsPhaseEnd(thread: string): void {
    const state = this.threads.get(thread);
    if (!state || !state.waitingForToolsPhase) return;

    state.waitingForToolsPhase = false;
    if (state.buffer.length > 0) {
      if (this.debounceMs > 0) {
        this.scheduleFlush(thread);
      } else {
        const bufferedMessages = state.buffer.slice();
        state.buffer = [];
        this.executeMessages(thread, bufferedMessages).catch(() => {
          // Errors are logged inside executeMessages
        });
      }
    }
  }

  /**
   * Clean up resources and clear all pending timers.
   */
  destroy(): void {
    for (const state of this.threads.values()) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
    }
    this.threads.clear();
  }

  private ensureThreadState(thread: string): ThreadState {
    let state = this.threads.get(thread);
    if (!state) {
      state = {
        buffer: [],
        busy: false,
        waitingForToolsPhase: false,
      };
      this.threads.set(thread, state);
    }
    return state;
  }

  private async flushThread(thread: string): Promise<void> {
    const state = this.ensureThreadState(thread);
    
    if (state.busy || state.buffer.length === 0) {
      return;
    }

    // Extract messages to process
    const batch = state.buffer.slice();
    state.buffer = [];

    // Clear timer
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }

    await this.executeMessages(thread, batch);
  }

  private async executeMessages(thread: string, messages: TriggerMessage[]): Promise<void> {
    const state = this.ensureThreadState(thread);
    
    if (state.busy) {
      // If busy, add to buffer for later processing
      state.buffer.push(...messages);
      return;
    }

    state.busy = true;

    try {
      if (this.processBuffer === ProcessBuffer.ALL_TOGETHER) {
        // Process all messages as a single batch
        await this.executor(thread, messages);
      } else {
        // Process messages one by one in FIFO order
        for (const message of messages) {
          await this.executor(thread, [message]);
        }
      }
    } finally {
      state.busy = false;

      // Check if more messages arrived while we were busy
      if (state.buffer.length > 0) {
        if (this.whenBusy === WhenBusy.WAIT) {
          // Process buffered messages
          if (this.debounceMs > 0) {
            this.scheduleFlush(thread);
          } else {
            const bufferedMessages = state.buffer.slice();
            state.buffer = [];
            await this.executeMessages(thread, bufferedMessages);
          }
        } else if (this.whenBusy === WhenBusy.INJECT_AFTER_TOOLS) {
          // Only flush if not waiting for tools phase
          if (!state.waitingForToolsPhase) {
            if (this.debounceMs > 0) {
              this.scheduleFlush(thread);
            } else {
              const bufferedMessages = state.buffer.slice();
              state.buffer = [];
              await this.executeMessages(thread, bufferedMessages);
            }
          }
        }
      }
    }
  }

  private scheduleFlush(thread: string): void {
    const state = this.ensureThreadState(thread);

    // Reset debounce timer
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = setTimeout(() => {
      this.flushThread(thread).catch(() => {
        // Errors are handled inside flushThread
      });
    }, this.debounceMs);
  }
}