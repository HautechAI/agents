// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
// Global test harness configuration for platform-ui
// - Polyfill ResizeObserver for Radix UI components
// - Normalize window.location to a stable origin (for MSW absolute handlers)
// - Provide safe defaults for config.apiBaseUrl
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
// Also ensure process.env is populated for test utils reading process.env
if (typeof process !== 'undefined' && process.env) {
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:3010';
}

const isRealSocketEnabled = typeof process !== 'undefined' && process.env?.TEST_ENABLE_REAL_SOCKET === '1';

/**
 * The UI does not require real socket connections during unit tests.
 * Keep the mock minimal and deterministic: components can opt back into the
 * real client by setting TEST_ENABLE_REAL_SOCKET=1 or calling vi.unmock('socket.io-client')
 * within a specific test.
 */
vi.mock('socket.io-client', async () => {
  if (typeof window === 'undefined' || isRealSocketEnabled) {
    return vi.importActual('socket.io-client');
  }

  type Listener = (...args: unknown[]) => void;
  const createSocket = () => {
    const listeners = new Map<string, Set<Listener>>();
    const managerListeners = new Map<string, Set<Listener>>();
    let connectDispatched = false;

    const manager = {
      on(event: string, callback: Listener) {
        const handlers = managerListeners.get(event) ?? new Set<Listener>();
        handlers.add(callback);
        managerListeners.set(event, handlers);
        return manager;
      },
      off(event: string, callback: Listener) {
        const handlers = managerListeners.get(event);
        if (!handlers) return manager;
        handlers.delete(callback);
        if (handlers.size === 0) managerListeners.delete(event);
        return manager;
      },
      emit(event: string, ...args: unknown[]) {
        const handlers = managerListeners.get(event);
        if (handlers) {
          handlers.forEach((handler) => handler(...args));
        }
        return manager;
      },
    };

    const socket = {
      connected: false,
      io: manager,
      on(event: string, callback: Listener) {
        const handlers = listeners.get(event) ?? new Set<Listener>();
        handlers.add(callback);
        listeners.set(event, handlers);

        if (event === 'connect' && connectDispatched) {
          queueMicrotask(() => callback());
        }

        return socket;
      },
      emit(event: string, ...args: unknown[]) {
        const handlers = listeners.get(event);
        if (handlers) {
          handlers.forEach((handler) => handler(...args));
        }
        if (event === 'connect') {
          socket.connected = true;
        } else if (event === 'disconnect') {
          socket.connected = false;
        }
        return socket;
      },
      disconnect() {
        if (!socket.connected) return socket;
        socket.connected = false;
        socket.emit('disconnect');
        listeners.clear();
        managerListeners.clear();
        return socket;
      },
    };

    queueMicrotask(() => {
      connectDispatched = true;
      socket.emit('connect');
    });

    return socket;
  };

  const factory = (..._args: unknown[]) => createSocket();

  return {
    __esModule: true,
    default: factory,
    io: factory,
    connect: factory,
    Manager: class {},
    Socket: class {},
  };
});

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

// Filter noisy future-flag warnings emitted by React Router during tests
if (typeof console !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: Parameters<typeof originalWarn>) => {
    if (args.some((arg) => typeof arg === 'string' && arg.includes('React Router Future Flag Warning'))) {
      return;
    }

    originalWarn(...args);
  };
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
