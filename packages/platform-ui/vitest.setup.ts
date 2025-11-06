import '@testing-library/jest-dom/vitest';

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
