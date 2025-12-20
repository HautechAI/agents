export type ThreadSoundControllerOptions = {
  delayMs: number;
  playNewMessage: (threadId: string) => void;
  playFinished: (threadId: string) => void;
  isRootThread: (threadId: string) => boolean;
  schedule?: (callback: () => void, delay: number) => number;
  cancel?: (handle: number) => void;
};

export class ThreadSoundController {
  private readonly delayMs: number;

  private readonly playNewMessage: (threadId: string) => void;

  private readonly playFinished: (threadId: string) => void;

  private readonly isRootThread: (threadId: string) => boolean;

  private readonly schedule: (callback: () => void, delay: number) => number;

  private readonly cancel: (handle: number) => void;

  private pendingNewMessage = new Map<string, number>();

  constructor(options: ThreadSoundControllerOptions) {
    this.delayMs = options.delayMs;
    this.playNewMessage = options.playNewMessage;
    this.playFinished = options.playFinished;
    this.isRootThread = options.isRootThread;
    this.schedule = options.schedule ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.cancel = options.cancel ?? ((handle) => globalThis.clearTimeout(handle));
  }

  handleMessageCreated(threadId: string) {
    if (!this.isRootThread(threadId)) return;

    const existing = this.pendingNewMessage.get(threadId);
    if (existing !== undefined) {
      this.cancel(existing);
    }

    const timer = this.schedule(() => {
      this.pendingNewMessage.delete(threadId);
      this.playNewMessage(threadId);
    }, this.delayMs);

    this.pendingNewMessage.set(threadId, timer);
  }

  handleThreadFinished(threadId: string) {
    if (!this.isRootThread(threadId)) return;

    const pending = this.pendingNewMessage.get(threadId);
    if (pending !== undefined) {
      this.cancel(pending);
      this.pendingNewMessage.delete(threadId);
    }

    this.playFinished(threadId);
  }

  dispose() {
    for (const timer of this.pendingNewMessage.values()) {
      this.cancel(timer);
    }
    this.pendingNewMessage.clear();
  }
}
