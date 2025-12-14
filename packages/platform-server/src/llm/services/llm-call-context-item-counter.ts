import type { RunEventsService } from '../../events/run-events.service';

type CounterInit = {
  eventId?: string | null;
  count?: number;
  ids?: string[];
};

export class LLMCallContextItemCounter {
  private eventId: string | null;
  private total: number;
  private readonly ids: string[];

  constructor(private readonly runEvents: RunEventsService, init?: CounterInit) {
    this.eventId = init?.eventId ?? null;
    this.total = init?.count ?? 0;
    this.ids = init?.ids ? [...init.ids] : [];
  }

  get value(): number {
    return this.total;
  }

  async bind(eventId: string): Promise<void> {
    this.eventId = eventId;
    await this.persist();
  }

  async increment(amount: number, ids?: string[]): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.total += amount;
    if (Array.isArray(ids) && ids.length > 0) {
      for (const id of ids) {
        if (typeof id !== 'string' || id.length === 0) continue;
        if (this.ids.includes(id)) continue;
        this.ids.push(id);
      }
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.eventId) return;
    await this.runEvents.updateLLMCallNewContextItemCount({
      eventId: this.eventId,
      newContextItemCount: this.total,
      newContextItemIds: [...this.ids],
    });
  }
}
