// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
// Global test harness configuration for platform-ui
// - Polyfill ResizeObserver for Radix UI components
// - Normalize window.location to a stable origin (for MSW absolute handlers)
// - Provide safe defaults for config.apiBaseUrl and tracing server
// - Stub tracing spans fetches to avoid network in CI
//
// Note: Do NOT start a global MSW server here because some tests manage their
// own msw server instance via TestProviders. Instead, keep fetch deterministic
// by stubbing tracing endpoints and using relative API base ('').
//
// Polyfill ResizeObserver for Radix UI components in tests
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Provide ResizeObserver if missing (jsdom)
if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverPolyfill,
    configurable: true,
    writable: false,
  });
}

// Avoid triggering jsdom navigation. Tests should set origins as needed.

// Provide required envs to avoid import-time throws in tests
vi.stubEnv('VITE_API_BASE_URL', process.env.VITE_API_BASE_URL ?? 'http://localhost:3010');
vi.stubEnv('VITE_TRACING_SERVER_URL', process.env.VITE_TRACING_SERVER_URL ?? 'http://localhost:4319');
// Also ensure process.env is populated for test utils reading process.env
if (typeof process !== 'undefined' && process.env) {
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:3010';
  process.env.VITE_TRACING_SERVER_URL = process.env.VITE_TRACING_SERVER_URL ?? 'http://localhost:4319';
}

// Minimal polyfills for UI libraries (Radix/Floating-UI)
if (typeof window !== 'undefined') {
  // matchMedia required by some CSS-in-JS and Radix internals
  // Provide a basic stub with event methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    dispatchEvent: vi.fn(),
  }));
}

// createRange for Floating-UI contextual fragment creation
if (typeof document !== 'undefined' && !document.createRange) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (document as any).createRange = () => ({
    setStart: () => {},
    setEnd: () => {},
    commonAncestorContainer: document.documentElement,
    createContextualFragment: (html: string) => {
      const template = document.createElement('template');
      template.innerHTML = html;
      return template.content;
    },
  });
}

// Avoid mutating config.apiBaseUrl globally to not affect unit tests that
// validate env resolution. Individual pages pass base '' explicitly where needed.

// Socket.io mock to keep tests isolated from real network and expose listener sets
const socketHarness = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  const schedule = (fn: () => void) => {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn);
    }
  };

  class MockSocketManager {
    listeners = new Map<string, Set<Listener>>();

    on(event: string, handler: Listener) {
      let set = this.listeners.get(event);
      if (!set) {
        set = new Set();
        this.listeners.set(event, set);
      }
      set.add(handler);
      return this;
    }

    off(event: string, handler: Listener) {
      const set = this.listeners.get(event);
      if (!set) return this;
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(event);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      const set = this.listeners.get(event);
      if (!set) return this;
      for (const fn of Array.from(set)) fn(...args);
      return this;
    }

    reset() {
      this.listeners.clear();
    }
  }

  class MockSocket {
    listeners = new Map<string, Set<Listener>>();
    emittedEvents: Array<{ event: string; args: unknown[] }> = [];
    connected = true;
    manager = new MockSocketManager();
    io = this.manager;

    on(event: string, handler: Listener) {
      let set = this.listeners.get(event);
      if (!set) {
        set = new Set();
        this.listeners.set(event, set);
      }
      set.add(handler);
      if (event === 'connect' && this.connected) {
        schedule(() => handler());
      }
      return this;
    }

    once(event: string, handler: Listener) {
      const wrapper: Listener = (...args) => {
        this.off(event, wrapper);
        handler(...args);
      };
      return this.on(event, wrapper);
    }

    off(event: string, handler: Listener) {
      const set = this.listeners.get(event);
      if (!set) return this;
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(event);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      if (event === 'connect') this.connected = true;
      if (event === 'disconnect') this.connected = false;
      this.emittedEvents.push({ event, args });
      return this;
    }

    trigger(event: string, ...args: unknown[]) {
      const set = this.listeners.get(event);
      if (!set) return this;
      for (const fn of Array.from(set)) fn(...args);
      return this;
    }

    connect() {
      this.connected = true;
      this.trigger('connect');
      return this;
    }

    open() {
      return this.connect();
    }

    close() {
      this.connected = false;
      this.trigger('disconnect');
      return this;
    }

    disconnect() {
      return this.close();
    }

    removeAllListeners(event?: string) {
      if (event) {
        this.listeners.delete(event);
      } else {
        this.listeners.clear();
      }
      return this;
    }

    reset() {
      this.listeners.clear();
      this.emittedEvents = [];
      this.connected = true;
      this.manager.reset();
    }
  }

  let active: MockSocket | null = null;

  return {
    create() {
      active = new MockSocket();
      return active;
    },
    get() {
      return active;
    },
    clear() {
      active = null;
    },
  };
});

vi.mock('socket.io-client', () => {
  return {
    io: () => {
      const socket = socketHarness.create();
      if (typeof globalThis !== 'undefined') {
        (globalThis as Record<string, unknown>).__socketIoMock = {
          socket,
          listeners: socket.listeners,
          managerListeners: socket.manager.listeners,
          emittedEvents: socket.emittedEvents,
        };
      }
      return socket;
    },
  };
});

// Stub tracing span fetches to avoid external network in CI.
// Tests that need specific spans should mock '@/api/modules/tracing' themselves.
vi.mock('@/api/modules/tracing', async () => {
  return {
    fetchSpansInRange: async () => [],
    fetchRunningSpansFromTo: async () => [],
  };
});

const { graphSocket } = await import('./src/lib/graph/socket');
const graphSocketRef = graphSocket as unknown as Record<string, unknown>;

const clearMaybe = (value: unknown) => {
  if (!value || typeof value !== 'object') return;
  if ('clear' in value) {
    const candidate = (value as { clear?: unknown }).clear;
    if (typeof candidate === 'function') {
      candidate.call(value);
    }
  }
};

if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).__graphSocketTestAPI = graphSocketRef;
}

afterEach(() => {
  const active = socketHarness.get();
  active?.reset();
  socketHarness.clear();

  clearMaybe(graphSocketRef.listeners);
  clearMaybe(graphSocketRef.stateListeners);
  clearMaybe(graphSocketRef.reminderListeners);
  clearMaybe(graphSocketRef.threadCreatedListeners);
  clearMaybe(graphSocketRef.threadUpdatedListeners);
  clearMaybe(graphSocketRef.threadActivityListeners);
  clearMaybe(graphSocketRef.threadRemindersListeners);
  clearMaybe(graphSocketRef.messageCreatedListeners);
  clearMaybe(graphSocketRef.runStatusListeners);
  clearMaybe(graphSocketRef.runEventListeners);
  clearMaybe(graphSocketRef.subscribedRooms);
  clearMaybe(graphSocketRef.connectCallbacks);
  clearMaybe(graphSocketRef.reconnectCallbacks);
  clearMaybe(graphSocketRef.disconnectCallbacks);
  clearMaybe(graphSocketRef.runCursors);
  graphSocketRef.socket = null;
});
