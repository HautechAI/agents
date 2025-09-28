import { Server, Socket } from 'socket.io';
import { LoggerService } from './logger.service';
import { CheckpointerService } from './checkpointer.service';
import { TriggerEventsService, TriggerEvent } from './trigger-events.service';

interface InitPayload {
  threadId?: string;
  agentId?: string;
}

interface TriggerInitPayload { nodeId: string; threadId?: string }
interface TriggerUpdatePayload { nodeId: string; threadId?: string }
interface TriggerClosePayload { nodeId: string }

export class SocketService {
  constructor(
    private io: Server,
    private logger: LoggerService,
    private checkpointer: CheckpointerService,
    private triggerEvents: TriggerEventsService,
  ) {}

  register() {
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: Socket) {
    this.logger.info(`Socket connected ${socket.id}`);
    let closed = false;
    let stream: any; // ChangeStream

    // trigger events: per-socket subscriptions by nodeId -> filter
    const subscriptions = new Map<string, { threadId?: string }>();
    const emitFor = (env: { nodeId: string; event: TriggerEvent }) => {
      const sub = subscriptions.get(env.nodeId);
      if (!sub) return;
      if (sub.threadId && env.event.threadId !== sub.threadId) return;
      socket.emit('trigger_event', { nodeId: env.nodeId, event: env.event });
    };
    const off = this.triggerEvents.onEvent(emitFor);

    const cleanup = async () => {
      if (stream) {
        try { await stream.close(); } catch (e) { this.logger.error('Error closing change stream', e); }
      }
      // remove trigger listener and clear subs
      try { off(); } catch {}
      subscriptions.clear();
      closed = true;
    };

    socket.on('disconnect', () => { cleanup(); });

    // Existing checkpoint stream logic (unchanged)
    socket.on('init', async (payload: InitPayload) => {
      if (closed) return;
      try {
        const { checkpointId, ...rest } = payload as any; // backward compat discard
        const latest = await this.checkpointer.fetchLatestWrites(rest);
        socket.emit('initial', { items: latest });
        stream = this.checkpointer.watchInserts(rest);
        stream.on('change', (change: any) => {
          if (change.fullDocument) {
            const normalized = this.checkpointer.normalize(change.fullDocument);
            socket.emit('append', normalized);
          }
        });
        stream.on('error', (err: any) => {
          this.logger.error('Change stream error', err);
          socket.emit('error', { message: 'change stream error' });
        });
      } catch (err) {
        this.logger.error('Init error', err);
        socket.emit('error', { message: 'init error' });
      }
    });

    // Trigger events: init/update/close
    socket.on('trigger_init', (payload: TriggerInitPayload) => {
      if (closed) return;
      const { nodeId, threadId } = payload || ({} as any);
      if (!nodeId) return;
      subscriptions.set(nodeId, { threadId });
      const items = this.triggerEvents.list(nodeId, { threadId, limit: 200 });
      socket.emit('trigger_initial', { nodeId, items });
    });

    socket.on('trigger_update', (payload: TriggerUpdatePayload) => {
      if (closed) return;
      const { nodeId, threadId } = payload || ({} as any);
      if (!nodeId) return;
      if (subscriptions.has(nodeId)) subscriptions.set(nodeId, { threadId });
      const items = this.triggerEvents.list(nodeId, { threadId, limit: 200 });
      socket.emit('trigger_initial', { nodeId, items });
    });

    socket.on('trigger_close', (payload: TriggerClosePayload) => {
      const { nodeId } = payload || ({} as any);
      if (!nodeId) return;
      subscriptions.delete(nodeId);
    });
  }
}
