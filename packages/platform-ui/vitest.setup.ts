import { afterAll, afterEach, beforeAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { server } from './__tests__/msw.server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Polyfill ResizeObserver for jsdom/Vitest environment
// Minimal implementation sufficient for components relying on observer presence
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Assign globally (covers both globalThis and window in jsdom)
// Do not override if provided by environment
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = ResizeObserver as unknown as typeof ResizeObserver;
}
if (typeof window !== 'undefined' && !(window as any).ResizeObserver) {
  (window as any).ResizeObserver = ResizeObserver as unknown as typeof ResizeObserver;
}
