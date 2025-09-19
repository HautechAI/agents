export type TriggerMessage = { content: string; info: Record<string, unknown> };

export abstract class BaseTrigger {
  private listeners: ((thread: string, messages: TriggerMessage[]) => Promise<void>)[] = [];

  async subscribe(callback: (thread: string, messages: TriggerMessage[]) => Promise<void>): Promise<void> {
    this.listeners.push(callback);
  }

  protected async notify(thread: string, messages: TriggerMessage[]): Promise<void> {
    await Promise.all(
      this.listeners.map(async (listener) => {
        await listener(thread, messages);
      }),
    );
  }
}
