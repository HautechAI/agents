import { Server, Socket } from 'socket.io';
import { LoggerService } from './logger.service';
import type { Db, ChangeStream, Document } from 'mongodb';

interface InitPayload {
  threadId?: string;
  agentId?: string;
}

export class SocketService {
  constructor(private io: Server, private logger: LoggerService, private db: Db) {}

  register() {
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: Socket) {
    this.logger.info(`Socket connected ${socket.id}`);
    let closed = false;
    let stream: any; // ChangeStream

    const cleanup = async () => {
      if (stream) {
        try { await stream.close(); } catch (e) { this.logger.error('Error closing change stream', e); }
      }
      closed = true;
    };

    socket.on('disconnect', () => { cleanup(); });

    socket.on('init', async (payload: InitPayload) => {
      if (closed) return;
      try {
        const collection = this.db.collection('checkpoint_writes');
        const { checkpointId, ...rest } = payload as any; // backward compat discard
        const mongoFilter: Document = {};
        if (rest?.threadId) mongoFilter.thread_id = rest.threadId;
        if (rest?.agentId) mongoFilter.agentId = rest.agentId;
        const docs = await collection.find(mongoFilter).sort({ _id: -1 }).limit(50).toArray();
        docs.reverse();
        socket.emit('initial', { items: docs.map((d) => this.normalize(d)) });
        const match: any = { operationType: 'insert' };
        if (rest?.threadId) match['fullDocument.thread_id'] = rest.threadId;
        if (rest?.agentId) match['fullDocument.agentId'] = rest.agentId;
        stream = collection.watch([{ $match: match }], { fullDocument: 'updateLookup' });
        stream.on('change', (change: any) => {
          if (change.fullDocument) socket.emit('append', this.normalize(change.fullDocument));
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
  }

  private normalize(raw: any) {
    let decoded: any = raw.value;
    try {
      if (raw.value && raw.value._bsontype === 'Binary') {
        const b = raw.value as any;
        const buf = b.buffer;
        const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : Buffer.from(buf).toString('utf8');
        try { decoded = JSON.parse(text); } catch { decoded = text; }
      }
    } catch (err) {
      this.logger.error('Error decoding checkpoint write value', err);
    }
    return {
      id: raw._id?.toHexString?.() || String(raw._id),
      checkpointId: raw.checkpoint_id,
      threadId: raw.thread_id,
      taskId: raw.task_id,
      channel: raw.channel,
      type: raw.type,
      idx: raw.idx,
      value: decoded,
      createdAt: raw._id?.getTimestamp?.() || new Date(),
      checkpointNs: raw.checkpoint_ns,
    };
  }
}
