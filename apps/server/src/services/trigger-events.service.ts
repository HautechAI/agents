import { EventEmitter } from 'events';
import { BaseTrigger, TriggerListener, TriggerMessage } from '../triggers/base.trigger';

export type TriggerEvent = {
  ts: number; // epoch millis
  threadId: string;
  messages: TriggerMessage[];
};

export type TriggerEventEnvelope = { nodeId: string; event: TriggerEvent };

export type TriggerEventFilter = { threadId?: string; limit?: number };

/**
 * In-memory store and emitter for Trigger events. Socket-only transport; no HTTP endpoints.
 * Stores up to TRIGGER_EVENTS_MAX events per node (default 300) in FIFO order (oldest evicted).
 */
export class TriggerEventsService {
  private readonly maxPerNode: number;
  private readonly store = new Map<string, TriggerEvent[]>(); // nodeId -> events (oldest->newest)
  private readonly emitter = new EventEmitter();

  constructor(maxPerNode?: number) {
    const fromEnv = Number(process.env.TRIGGER_EVENTS_MAX);
    const resolved = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : undefined;
    this.maxPerNode = maxPerNode || resolved || 300;
  }

  /**
   * Bind a trigger instance to a node id. Subsequent messages are recorded and re-emitted.
   */
  bind(nodeId: string, trigger: BaseTrigger): void {
    const listener: TriggerListener = {
      invoke: async (threadId, messages) => {
        const ev: TriggerEvent = { ts: Date.now(), threadId, messages };
        this.append(nodeId, ev);
        this.emitter.emit('event', { nodeId, event: ev } as TriggerEventEnvelope);
      },
    };
    // Best-effort; BaseTrigger.subscribe returns Promise<void>
    void trigger.subscribe(listener);
  }

  /**
   * Return events for a node. Newest-first; optionally filtered by threadId and limited.
   */
  list(nodeId: string, filter?: TriggerEventFilter): TriggerEvent[] {
    const all = this.store.get(nodeId) || [];
    const byThread = filter?.threadId ? all.filter((e) => e.threadId === filter.threadId) : all;
    const newestFirst = [...byThread].reverse();
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : this.maxPerNode;
    return newestFirst.slice(0, limit);
  }

  onEvent(cb: (env: TriggerEventEnvelope) => void): () => void {
    this.emitter.on('event', cb);
    return () => this.emitter.off('event', cb);
  }

  // Internal: append and prune per-node buffer
  private append(nodeId: string, ev: TriggerEvent): void {
    let list = this.store.get(nodeId);
    if (!list) {
      list = [];
      this.store.set(nodeId, list);
    }
    list.push(ev);
    if (list.length > this.maxPerNode) {
      const excess = list.length - this.maxPerNode;
      list.splice(0, excess); // drop oldest first
    }
  }
}
