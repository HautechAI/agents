// src/index.ts
import { AsyncLocalStorage } from "async_hooks";
import { randomBytes } from "crypto";
var als = new AsyncLocalStorage();
var config = null;
function init(c) {
  const retry = { maxRetries: 3, baseMs: 100, maxMs: 2e3, jitter: true, ...c.retry || {} };
  const batching = { maxBatchSize: 50, flushIntervalMs: 1e3, ...c.batching || {} };
  const sampling = { rate: 1, ...c.sampling || {} };
  const endpoints = { extended: c.endpoints.extended || "", otlp: c.endpoints.otlp || "" };
  config = { mode: c.mode, endpoints, batching, sampling, defaultAttributes: c.defaultAttributes || {}, retry };
  return config;
}
function genId(bytes) {
  return randomBytes(bytes).toString("hex");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function httpPost(url, body, idempotencyKey) {
  if (!url) return;
  const headers = { "content-type": "application/json" };
  if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
  const payload = JSON.stringify(body);
  const r = await fetch(url, { method: "POST", headers, body: payload });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}
function backoff(cfg, attempt) {
  const base = cfg.retry.baseMs * Math.pow(2, attempt);
  const capped = Math.min(base, cfg.retry.maxMs);
  return cfg.retry.jitter ? Math.random() * capped : capped;
}
async function retryingPost(url, body, idempotencyKey) {
  let attempt = 0;
  const cfg = config;
  for (; ; ) {
    try {
      await httpPost(url, body, idempotencyKey);
      return;
    } catch (e) {
      if (attempt >= cfg.retry.maxRetries) throw e;
      await sleep(backoff(cfg, attempt++));
    }
  }
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function withSpan(input, fn) {
  if (!config) throw new Error("obs-sdk not initialized");
  const cfg = config;
  const parent = als.getStore();
  const traceId = parent?.traceId || genId(16);
  const spanId = genId(8);
  const ctx = { traceId, spanId, parentSpanId: parent?.spanId };
  const baseAttrs = { ...cfg.defaultAttributes || {}, ...input.attributes || {} };
  const startTime = now();
  if (cfg.mode === "extended") {
    const created = {
      state: "created",
      traceId,
      spanId,
      parentSpanId: ctx.parentSpanId,
      label: input.label,
      startTime,
      status: "running",
      attributes: baseAttrs,
      nodeId: input.nodeId,
      threadId: input.threadId
    };
    const keyCreated = genId(8);
    await retryingPost(cfg.endpoints.extended + "/v1/spans/upsert", created, keyCreated).catch(() => {
    });
  }
  return await new Promise((resolve, reject) => {
    als.run(ctx, async () => {
      try {
        const result = await fn();
        if (cfg.mode === "extended") {
          const completed = {
            state: "completed",
            traceId,
            spanId,
            endTime: now(),
            status: "ok"
          };
          await retryingPost(cfg.endpoints.extended + "/v1/spans/upsert", completed, genId(8)).catch(() => {
          });
        } else {
          const otlpLike = [{ traceId, spanId, parentSpanId: ctx.parentSpanId, label: input.label, startTime, endTime: now(), status: "ok", attributes: baseAttrs }];
          await retryingPost(cfg.endpoints.otlp + "/v1/traces", { spans: otlpLike }, genId(8)).catch(() => {
          });
        }
        resolve(result);
      } catch (err) {
        if (cfg.mode === "extended") {
          const completed = {
            state: "completed",
            traceId,
            spanId,
            endTime: now(),
            status: "error"
          };
          await retryingPost(cfg.endpoints.extended + "/v1/spans/upsert", completed, genId(8)).catch(() => {
          });
        } else {
          const otlpLike = [{ traceId, spanId, parentSpanId: ctx.parentSpanId, label: input.label, startTime, endTime: now(), status: "error", attributes: baseAttrs }];
          await retryingPost(cfg.endpoints.otlp + "/v1/traces", { spans: otlpLike }, genId(8)).catch(() => {
          });
        }
        reject(err);
      }
    });
  });
}
function currentSpan() {
  return als.getStore();
}
async function flush() {
}
export {
  currentSpan,
  flush,
  init,
  withSpan
};
