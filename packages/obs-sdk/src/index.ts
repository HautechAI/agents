import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

// Minimal types for Stage 1
export type ObsMode = 'extended' | 'otlp';

export interface InitConfig {
  mode: ObsMode;
  endpoints: {
    extended?: string; // base URL for extended server
    otlp?: string; // base URL for OTLP HTTP
  };
  batching?: { maxBatchSize?: number; flushIntervalMs?: number };
  sampling?: { rate?: number };
  defaultAttributes?: Record<string, unknown>;
  retry?: { maxRetries?: number; baseMs?: number; maxMs?: number; jitter?: boolean };
}

export interface SpanInput {
  label: string;
  attributes?: Record<string, unknown>;
  nodeId?: string;
  threadId?: string;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

type InternalConfig = {
  mode: ObsMode;
  endpoints: { extended: string; otlp: string };
  batching: { maxBatchSize: number; flushIntervalMs: number };
  sampling: { rate: number };
  defaultAttributes: Record<string, unknown>;
  retry: { maxRetries: number; baseMs: number; maxMs: number; jitter: boolean };
};

const als = new AsyncLocalStorage<SpanContext>();

let config: InternalConfig | null = null;

export function init(c: InitConfig) {
  const retry: InternalConfig['retry'] = { maxRetries: 3, baseMs: 100, maxMs: 2000, jitter: true, ...(c.retry || {}) };
  const batching: InternalConfig['batching'] = { maxBatchSize: 50, flushIntervalMs: 1000, ...(c.batching || {}) };
  const sampling: InternalConfig['sampling'] = { rate: 1, ...(c.sampling || {}) };
  const endpoints: InternalConfig['endpoints'] = { extended: c.endpoints.extended || '', otlp: c.endpoints.otlp || '' };
  config = { mode: c.mode, endpoints, batching, sampling, defaultAttributes: c.defaultAttributes || {}, retry };
  return config;
}

function genId(bytes: number) {
  return randomBytes(bytes).toString('hex');
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function httpPost(url: string, body: unknown, idempotencyKey?: string) {
  if (!url) return; // allow SDK usage without server for tests
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  const payload = JSON.stringify(body);
  const r = await fetch(url, { method: 'POST', headers, body: payload });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

function backoff(cfg: InternalConfig, attempt: number) {
  const base = cfg.retry.baseMs * Math.pow(2, attempt);
  const capped = Math.min(base, cfg.retry.maxMs);
  return cfg.retry.jitter ? Math.random() * capped : capped;
}

async function retryingPost(url: string, body: unknown, idempotencyKey: string) {
  let attempt = 0;
  const cfg = config as InternalConfig;
  for (;;) {
    try {
      await httpPost(url, body, idempotencyKey);
      return;
    } catch (e) {
      if (attempt >= cfg.retry.maxRetries) throw e;
      await sleep(backoff(cfg, attempt++));
    }
  }
}

function now() { return new Date().toISOString(); }

export async function withSpan<T>(input: SpanInput, fn: () => Promise<T> | T): Promise<T> {
  if (!config) throw new Error('obs-sdk not initialized');
  const cfg = config as InternalConfig; // capture for type narrowing
  const parent = als.getStore();
  const traceId = parent?.traceId || genId(16);
  const spanId = genId(8);
  const ctx: SpanContext = { traceId, spanId, parentSpanId: parent?.spanId };

  const baseAttrs = { ...(cfg.defaultAttributes || {}), ...(input.attributes || {}) };
  const startTime = now();

  if (cfg.mode === 'extended') {
    const created = {
      state: 'created',
      traceId, spanId, parentSpanId: ctx.parentSpanId,
      label: input.label,
      startTime,
      status: 'running',
      attributes: baseAttrs,
      nodeId: input.nodeId,
      threadId: input.threadId
    };
    const keyCreated = genId(8);
    await retryingPost(cfg.endpoints.extended + '/v1/spans/upsert', created, keyCreated).catch(() => {});
  }

  return await new Promise<T>((resolve, reject) => {
    als.run(ctx, async () => {
      try {
        const result = await fn();
        if (cfg.mode === 'extended') {
          const completed = {
            state: 'completed',
            traceId, spanId,
            endTime: now(),
            status: 'ok'
          };
          await retryingPost(cfg.endpoints.extended + '/v1/spans/upsert', completed, genId(8)).catch(() => {});
        } else {
          // otlp mode buffer: send one completed span via OTLP HTTP/protobuf later
          // Stage 1 simplified: send JSON to /v1/traces placeholder; server will map when OTLP implemented
          const otlpLike = [{ traceId, spanId, parentSpanId: ctx.parentSpanId, label: input.label, startTime, endTime: now(), status: 'ok', attributes: baseAttrs }];
          await retryingPost(cfg.endpoints.otlp + '/v1/traces', { spans: otlpLike }, genId(8)).catch(() => {});
        }
        resolve(result);
      } catch (err) {
        if (cfg.mode === 'extended') {
          const completed = {
            state: 'completed',
            traceId, spanId,
            endTime: now(),
            status: 'error'
          };
          await retryingPost(cfg.endpoints.extended + '/v1/spans/upsert', completed, genId(8)).catch(() => {});
        } else {
          const otlpLike = [{ traceId, spanId, parentSpanId: ctx.parentSpanId, label: input.label, startTime, endTime: now(), status: 'error', attributes: baseAttrs }];
          await retryingPost(cfg.endpoints.otlp + '/v1/traces', { spans: otlpLike }, genId(8)).catch(() => {});
        }
        reject(err);
      }
    });
  });
}

export function currentSpan(): SpanContext | undefined { return als.getStore(); }

export async function flush() {
  // Stage 1 minimal stub (no background buffers yet)
}
