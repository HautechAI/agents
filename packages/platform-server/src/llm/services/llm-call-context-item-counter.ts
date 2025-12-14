import type { RunEventsService } from '../../events/run-events.service';

type CounterInit = {
  eventId?: string | null;
  count?: number;
};

export class LLMCallContextItemCounter {
  private eventId: string | null;
  private total: number;

  constructor(private readonly runEvents: RunEventsService, init?: CounterInit) {
    this.eventId = init?.eventId ?? null;
    this.total = init?.count ?? 0;
  }

  get value(): number {
    return this.total;
  }

  async bind(eventId: string): Promise<void> {
    this.eventId = eventId;
    await this.persist();
  }

  async increment(amount: number): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.total += amount;
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.eventId) return;
    await this.runEvents.updateLLMCallNewContextItemCount({
      eventId: this.eventId,
      newContextItemCount: this.total,
    });
  }
}
