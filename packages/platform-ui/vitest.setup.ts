import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock socket.io-client to avoid real WS connections in tests (prevents libuv crashes)
vi.mock('socket.io-client', () => ({
  io: () => ({ on: () => {}, off: () => {}, emit: () => {}, disconnect: () => {} }),
}));

// Polyfill ResizeObserver for jsdom/Vitest environment
// Minimal implementation sufficient for components relying on observer presence
class RO {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

type WithRO = { ResizeObserver?: typeof RO };
const g = globalThis as unknown as WithRO;
if (!g.ResizeObserver) g.ResizeObserver = RO;

if (typeof window !== 'undefined') {
  const w = window as unknown as WithRO;
  if (!w.ResizeObserver) w.ResizeObserver = RO;
}
