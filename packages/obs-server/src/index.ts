import Fastify from 'fastify';
import { MongoClient, Db, Collection } from 'mongodb';
import { z } from 'zod';

const PORT = Number(process.env.PORT || 4319);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/obs';

type SpanDoc = {
  _id?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  label: string;
  status: 'running' | 'ok' | 'error' | 'cancelled';
  startTime: string; // ISO
  endTime?: string;
  completed: boolean;
  lastUpdate: string;
  attributes: Record<string, unknown>;
  events: Array<{ ts: string; name: string; attrs?: Record<string, unknown> }>;
  rev: number;
  idempotencyKeys: string[];
  createdAt: string;
  updatedAt: string;
  nodeId?: string;
  threadId?: string;
};

let db: Db;
let spans: Collection<SpanDoc>;

const UpsertSchema = z.object({
  state: z.enum(['created', 'updated', 'completed']),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  label: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(['running', 'ok', 'error', 'cancelled']).optional(),
  attributes: z.record(z.any()).optional(),
  events: z.array(z.object({ ts: z.string(), name: z.string(), attrs: z.record(z.any()).optional() })).optional(),
  idempotencyKey: z.string().optional(),
  rev: z.number().int().optional(),
  nodeId: z.string().optional(),
  threadId: z.string().optional()
});

const QuerySchema = z.object({
  status: z.enum(['running', 'ok', 'error', 'cancelled']).optional(),
  running: z.coerce.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  label: z.string().optional(),
  sort: z.enum(['lastUpdate', 'startTime']).default('lastUpdate'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

async function main() {
  const fastify = Fastify({ logger: true });

  // Mongo connection
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  db = client.db();
  spans = db.collection<SpanDoc>('spans');
  // Indexes
  await spans.createIndex({ status: 1, lastUpdate: -1 });
  await spans.createIndex({ startTime: -1 });
  await spans.createIndex({ traceId: 1, spanId: 1 }, { unique: true });
  await spans.createIndex({ completed: 1, lastUpdate: -1 }, { partialFilterExpression: { completed: false } });

  fastify.get('/healthz', async () => ({ ok: true }));
  fastify.get('/readyz', async () => {
    await db.command({ ping: 1 });
    return { ok: true };
  });

  fastify.post('/v1/spans/upsert', async (req, reply) => {
    const parsed = UpsertSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const now = new Date().toISOString();
    const key = body.idempotencyKey;
    // idempotency: if key was used, return 200
    if (key) {
      const existing = await spans.findOne({ traceId: body.traceId, spanId: body.spanId, idempotencyKeys: key });
      if (existing) return { ok: true, id: existing._id };
    }
    const filter = { traceId: body.traceId, spanId: body.spanId };
    const doc = await spans.findOne(filter);
    const setOnInsert: Partial<SpanDoc> = doc ? {} : {
      traceId: body.traceId,
      spanId: body.spanId,
      parentSpanId: body.parentSpanId,
      label: body.label || 'span',
      status: 'running',
      startTime: body.startTime || now,
      endTime: undefined,
      completed: false,
      attributes: body.attributes || {},
      events: [],
      rev: 0,
      idempotencyKeys: key ? [key] : [],
      createdAt: now,
      updatedAt: now,
      lastUpdate: now,
      nodeId: body.nodeId,
      threadId: body.threadId
    };

    const update: any = { $setOnInsert: setOnInsert };
    update.$set = { updatedAt: now, lastUpdate: now };
    update.$inc = { rev: 1 };
    if (key) update.$addToSet = { idempotencyKeys: key };

    // transitions
    if (body.state === 'created') {
      update.$set = {
        ...update.$set,
        label: body.label ?? (doc?.label || 'span'),
        status: 'running',
        startTime: body.startTime || doc?.startTime || now,
        attributes: { ...(doc?.attributes || {}), ...(body.attributes || {}) },
        parentSpanId: body.parentSpanId ?? doc?.parentSpanId,
        nodeId: body.nodeId ?? doc?.nodeId,
        threadId: body.threadId ?? doc?.threadId
      };
    } else if (body.state === 'updated') {
      update.$set = {
        ...update.$set,
        attributes: { ...(doc?.attributes || {}), ...(body.attributes || {}) }
      };
    } else if (body.state === 'completed') {
      // prevent regression from completed -> running
      if (doc?.completed) {
        // already completed: idempotent
        return { ok: true, id: doc._id };
      }
      update.$set = {
        ...update.$set,
        endTime: body.endTime || now,
        completed: true,
        status: body.status || 'ok'
      };
    }

    await spans.updateOne(filter, update, { upsert: true });
    const final = await spans.findOne(filter);
    return { ok: true, id: final?._id };
  });

  fastify.get('/v1/spans', async (req, reply) => {
    const parsed = QuerySchema.safeParse((req as any).query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { status, running, from, to, label, sort, cursor, limit } = parsed.data;
    const q: any = {};
    if (status) q.status = status;
    if (running !== undefined) q.completed = running ? false : { $in: [true, false] };
    if (label) q.label = label;
    if (from || to) {
      const field = sort === 'startTime' ? 'startTime' : 'lastUpdate';
      q[field] = {};
      if (from) q[field].$gte = from;
      if (to) q[field].$lte = to;
    }
    const sortSpec: any = sort === 'startTime' ? { startTime: -1, _id: -1 } : { lastUpdate: -1, _id: -1 };
    if (cursor) {
      // cursor is base64 of JSON { lastUpdate, _id } or { startTime, _id }
      try {
        const obj = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        const field = sort === 'startTime' ? 'startTime' : 'lastUpdate';
        q.$or = [
          { [field]: { $lt: obj[field] } },
          { [field]: obj[field], _id: { $lt: obj._id } }
        ];
      } catch {}
    }
    const docs = await spans.find(q).sort(sortSpec).limit(limit).toArray();
    const tail = docs[docs.length - 1] as any;
    const cursorObj = tail ? { [sort === 'startTime' ? 'startTime' : 'lastUpdate']: tail[sort === 'startTime' ? 'startTime' : 'lastUpdate'], _id: tail._id } : undefined;
    const nextCursor = cursorObj ? Buffer.from(JSON.stringify(cursorObj)).toString('base64') : undefined;
    return { items: docs, nextCursor };
  });

  fastify.get('/v1/spans/:id', async (req, reply) => {
    const id = (req.params as any).id;
    const { ObjectId } = await import('mongodb');
    const doc = await spans.findOne({ _id: new ObjectId(id) as any });
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });

  // OTLP HTTP/protobuf placeholder: accept JSON for Stage 1 PoC and map core fields
  fastify.post('/v1/traces', async (req, reply) => {
    const body = (req as any).body as any;
    const now = new Date().toISOString();
    const spansIn = Array.isArray(body?.spans) ? body.spans : [];
    await Promise.all(spansIn.map(async (s: any) => {
      const filter = { traceId: s.traceId, spanId: s.spanId };
      const doc: Partial<SpanDoc> = {
        traceId: s.traceId,
        spanId: s.spanId,
        parentSpanId: s.parentSpanId,
        label: s.label || 'span',
        status: s.status || 'ok',
        startTime: s.startTime || now,
        endTime: s.endTime || now,
        completed: true,
        lastUpdate: now,
        attributes: s.attributes || {},
        events: [],
        rev: 1,
        idempotencyKeys: [],
        createdAt: now,
        updatedAt: now
      };
      await spans.updateOne(filter, { $set: doc }, { upsert: true });
    }));
    return { ok: true, count: spansIn.length };
  });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
