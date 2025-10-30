import { z } from 'zod';
import type { NodeStatusEvent as NodeStatusEventSrc } from '../../src/lib/graph/types';
import type { SpanDoc as SpanDocSrc } from '../../src/lib/tracing/api';

// Local explicit interfaces to avoid any implicit anys
export interface NodeStatusEvent extends NodeStatusEventSrc {}

export interface NodeStateEvent {
  nodeId: string;
  state: Record<string, unknown>;
  updatedAt: string;
}

export interface ServerCheckpointWrite {
  id: string;
  checkpointId: string;
  threadId: string;
  taskId: string;
  channel: string;
  type: string;
  idx: number;
  value: unknown;
  createdAt: string;
}

export interface InitialPayload {
  items: ServerCheckpointWrite[];
}

export interface SpanDoc extends SpanDocSrc {}

// Zod schemas to validate unknown inputs
const provisionState = z.enum([
  'not_ready',
  'provisioning',
  'ready',
  'error',
  'deprovisioning',
  'provisioning_error',
  'deprovisioning_error',
]);

const NodeStatusEventSchema = z.object({
  nodeId: z.string(),
  isPaused: z.boolean().optional(),
  provisionStatus: z.object({ state: provisionState, details: z.unknown().optional() }).optional(),
  updatedAt: z.string().optional(),
});

const NodeStateEventSchema = z.object({
  nodeId: z.string(),
  state: z.record(z.unknown()),
  updatedAt: z.string(),
});

const ServerCheckpointWriteSchema = z.object({
  id: z.string(),
  checkpointId: z.string(),
  threadId: z.string(),
  taskId: z.string(),
  channel: z.string(),
  type: z.string(),
  idx: z.number(),
  value: z.unknown(),
  createdAt: z.string(),
});

const InitialPayloadSchema = z.object({
  items: z.array(ServerCheckpointWriteSchema),
});

const SpanDocSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  label: z.string(),
  status: z.enum(['running', 'ok', 'error', 'cancelled']),
  startTime: z.string(),
  completed: z.boolean(),
  lastUpdate: z.string(),
  attributes: z.record(z.unknown()),
  nodeId: z.string().optional(),
});

// Receiver interface used by the socket mock to subscribe to bus events
export interface Receiver {
  onConnect(): void;
  onDisconnect(): void;
  onNodeStatus(ev: NodeStatusEvent): void;
  onNodeState(ev: NodeStateEvent): void;
  onSpanUpsert(ev: SpanDoc): void;
  onCheckpointInitial(ev: InitialPayload): void;
  onCheckpointAppend(ev: ServerCheckpointWrite): void;
  onError(e: unknown): void;
}

const receivers = new Set<Receiver>();

export function registerReceiver(r: Receiver): () => void {
  receivers.add(r);
  return () => receivers.delete(r);
}

// Emitters with zod validation from unknown inputs
export function emitNodeStatus(input: unknown): void {
  const parsed = NodeStatusEventSchema.parse(input);
  for (const r of receivers) r.onNodeStatus(parsed);
}

export function emitNodeState(input: unknown): void {
  const parsed = NodeStateEventSchema.parse(input);
  for (const r of receivers) r.onNodeState(parsed);
}

export function emitSpanUpsert(input: unknown): void {
  const parsed = SpanDocSchema.parse(input);
  for (const r of receivers) r.onSpanUpsert(parsed);
}

export function emitCheckpointInitial(input: unknown): void {
  const parsed = InitialPayloadSchema.parse(input);
  for (const r of receivers) r.onCheckpointInitial(parsed);
}

export function emitCheckpointAppend(input: unknown): void {
  const parsed = ServerCheckpointWriteSchema.parse(input);
  for (const r of receivers) r.onCheckpointAppend(parsed);
}

export function emitCheckpointError(input: unknown): void {
  let payload: unknown = input;
  if (typeof input === 'string') payload = new Error(input);
  for (const r of receivers) r.onError(payload);
}

export function emitConnect(): void {
  for (const r of receivers) r.onConnect();
}

export function emitDisconnect(): void {
  for (const r of receivers) r.onDisconnect();
}
