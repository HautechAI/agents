import { io, Socket } from 'socket.io-client';
import type { NodeStatusEvent } from './types';

type Listener = (ev: NodeStatusEvent) => void;

export type TriggerEvent = { ts: number; threadId: string; messages: Array<{ content: string; info: Record<string, unknown> }> };

class GraphSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private triggerListeners = new Map<string, Set<(ev: { nodeId: string; event: TriggerEvent }) => void>>();

  connect(baseUrl?: string) {
    if (this.socket) return this.socket;
    interface ViteEnv { VITE_GRAPH_API_BASE?: string }
    const envHost = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: ViteEnv }).env?.VITE_GRAPH_API_BASE : undefined);
    const host = baseUrl || envHost || 'http://localhost:3010';
    this.socket = io(host, { path: '/socket.io', transports: ['websocket'], forceNew: false, autoConnect: true, timeout: 10000, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000, withCredentials: true });
    this.socket.on('connect', () => {
      // noop
    });
    this.socket.on('node_status', (payload: NodeStatusEvent) => {
      const set = this.listeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    });
    this.socket.on('trigger_event', (payload: { nodeId: string; event: TriggerEvent }) => {
      const set = this.triggerListeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    });
    return this.socket;
  }

  getSocket(): Socket {
    if (!this.socket) this.connect();
    return this.socket!;
  }

  onNodeStatus(nodeId: string, cb: Listener) {
    let set = this.listeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.listeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.listeners.delete(nodeId);
    };
  }

  // Trigger events API
  emitTriggerInit(payload: { nodeId: string; threadId?: string }) {
    this.getSocket().emit('trigger_init', payload);
  }
  emitTriggerUpdate(payload: { nodeId: string; threadId?: string }) {
    this.getSocket().emit('trigger_update', payload);
  }
  emitTriggerClose(payload: { nodeId: string }) {
    this.getSocket().emit('trigger_close', payload);
  }
  onTriggerInitial(cb: (payload: { nodeId: string; items: TriggerEvent[] }) => void) {
    this.getSocket().on('trigger_initial', cb);
    return () => this.getSocket().off('trigger_initial', cb);
  }
  onTriggerEvent(nodeId: string, cb: (payload: { nodeId: string; event: TriggerEvent }) => void) {
    let set = this.triggerListeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.triggerListeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.triggerListeners.delete(nodeId);
    };
  }
}

export const graphSocket = new GraphSocket();
