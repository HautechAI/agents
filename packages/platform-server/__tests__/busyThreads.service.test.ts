import { describe, it, expect } from 'vitest';
import { BusyThreadsService } from '../src/graph/nodes/agent/busyThreads.service';

describe('BusyThreadsService', () => {
  it('acquires and releases per node/thread', () => {
    const svc = new BusyThreadsService();
    const node = 'n1';
    const thread = 't1';
    expect(svc.isActive(node, thread)).toBe(false);
    expect(svc.tryAcquire(node, thread)).toBe(true);
    expect(svc.isActive(node, thread)).toBe(true);
    expect(svc.tryAcquire(node, thread)).toBe(false);
    expect(svc.tryAcquire(node, 't2')).toBe(true);
    svc.release(node, thread);
    expect(svc.isActive(node, thread)).toBe(false);
    expect(svc.tryAcquire(node, thread)).toBe(true);
  });
});
