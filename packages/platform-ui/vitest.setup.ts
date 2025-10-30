// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { registerReceiver, type NodeStatusEvent, type NodeStateEvent, type SpanDoc, type ServerCheckpointWrite, type InitialPayload } from './__tests__/mocks/socketBus';
// Polyfill ResizeObserver for Radix UI components in tests
class RO {
	observe() {}
	unobserve() {}
	disconnect() {}
}
// Provide ResizeObserver if missing (jsdom)
interface G extends Global {
	ResizeObserver?: typeof RO;
}
const g = globalThis as unknown as G;
if (typeof g.ResizeObserver === 'undefined') {
	g.ResizeObserver = RO;
}


// Strict, inert socket.io-client mock for tests
// - No timers/network/reconnection
// - Implements on/emit/connect/disconnect
// - Hooks into a test-only event bus so tests can drive events deterministically



type ConnectHandler = () => void;

type DisconnectHandler = () => void;

class MockSocket {
  private connectHandlers = new Set<ConnectHandler>();
  private disconnectHandlers = new Set<DisconnectHandler>();
  private nodeStatusHandlers = new Set<(payload: NodeStatusEvent) => void>();
  private nodeStateHandlers = new Set<(payload: NodeStateEvent) => void>();
  private spanUpsertHandlers = new Set<(payload: SpanDoc) => void>();
  private initialHandlers = new Set<(payload: InitialPayload) => void>();
  private appendHandlers = new Set<(payload: ServerCheckpointWrite) => void>();
  private errorHandlers = new Set<(e: unknown) => void>();
  private connected = false;

  // Register with test bus
  private unregister: (() => void) | null = null;

  constructor() {
    this.unregister = registerReceiver({
      onConnect: () => this.fireConnect(),
      onDisconnect: () => this.fireDisconnect(),
      onNodeStatus: (ev) => this.fireNodeStatus(ev),
      onNodeState: (ev) => this.fireNodeState(ev),
      onSpanUpsert: (ev) => this.fireSpanUpsert(ev),
      onCheckpointInitial: (ev) => this.fireInitial(ev),
      onCheckpointAppend: (ev) => this.fireAppend(ev),
      onError: (e) => this.fireError(e),
    });
    // Auto-connect immediately (no timers)
    this.connected = true;
    this.fireConnect();
  }

  on(event: 'connect', handler: ConnectHandler): this;
  on(event: 'disconnect', handler: DisconnectHandler): this;
  on(event: 'node_status', handler: (payload: NodeStatusEvent) => void): this;
  on(event: 'node_state', handler: (payload: NodeStateEvent) => void): this;
  on(event: 'span_upsert', handler: (payload: SpanDoc) => void): this;
  on(event: 'initial', handler: (payload: InitialPayload) => void): this;
  on(event: 'append', handler: (payload: ServerCheckpointWrite) => void): this;
  on(event: 'error', handler: (e: unknown) => void): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case 'connect':
        this.connectHandlers.add(handler as ConnectHandler);
        break;
      case 'disconnect':
        this.disconnectHandlers.add(handler as DisconnectHandler);
        break;
      case 'node_status':
        this.nodeStatusHandlers.add(handler as (payload: NodeStatusEvent) => void);
        break;
      case 'node_state':
        this.nodeStateHandlers.add(handler as (payload: NodeStateEvent) => void);
        break;
      case 'span_upsert':
        this.spanUpsertHandlers.add(handler as (payload: SpanDoc) => void);
        break;
      case 'initial':
        this.initialHandlers.add(handler as (payload: InitialPayload) => void);
        break;
      case 'append':
        this.appendHandlers.add(handler as (payload: ServerCheckpointWrite) => void);
        break;
      case 'error':
        this.errorHandlers.add(handler as (e: unknown) => void);
        break;
      default:
        // ignore unknown events in mock
        break;
    }
    return this;
  }

  emit(event: 'init', _payload?: Record<string, unknown>): void;
  emit(_event: string, _payload?: unknown): void {
    // Inert by design; only 'init' is emitted by code under test and has no side-effect here
    return;
  }

  connect(): this {
    if (!this.connected) {
      this.connected = true;
      this.fireConnect();
    }
    return this;
  }

  disconnect(): this {
    if (this.connected) {
      this.connected = false;
      this.fireDisconnect();
    }
    return this;
  }

  private fireConnect() {
    for (const fn of this.connectHandlers) fn();
  }
  private fireDisconnect() {
    for (const fn of this.disconnectHandlers) fn();
  }
  private fireNodeStatus(ev: NodeStatusEvent) {
    for (const fn of this.nodeStatusHandlers) fn(ev);
  }
  private fireNodeState(ev: NodeStateEvent) {
    for (const fn of this.nodeStateHandlers) fn(ev);
  }
  private fireSpanUpsert(ev: SpanDoc) {
    for (const fn of this.spanUpsertHandlers) fn(ev);
  }
  private fireInitial(ev: InitialPayload) {
    for (const fn of this.initialHandlers) fn(ev);
  }
  private fireAppend(ev: ServerCheckpointWrite) {
    for (const fn of this.appendHandlers) fn(ev);
  }
  private fireError(e: unknown) {
    for (const fn of this.errorHandlers) fn(e);
  }

  // Allow test cleanup to detach from bus
  dispose() {
    if (this.unregister) this.unregister();
    this.unregister = null;
  }
}

vi.mock('socket.io-client', () => {
  return {
    io: (_url?: string, _opts?: Record<string, unknown>) => new MockSocket(),
  };
});
