"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  currentSpan: () => currentSpan,
  flush: () => flush,
  init: () => init,
  withSpan: () => withSpan
});
module.exports = __toCommonJS(index_exports);
var import_node_async_hooks = require("async_hooks");
var import_node_crypto = require("crypto");
var als = new import_node_async_hooks.AsyncLocalStorage();
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
  return (0, import_node_crypto.randomBytes)(bytes).toString("hex");
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  currentSpan,
  flush,
  init,
  withSpan
});
