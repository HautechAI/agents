import { describe, it, expect } from vitest;
import { ThreadLockService } from ../src/graph/nodes/agent/threadLock.service;

// Unit tests for ThreadLockService semantics

describe(ThreadLockService, () => {
  it(serializes

  it('multiple joiners resolve and single-flight invariant holds', async () => {
    const locks = new ThreadLockService();
    const t = 't3';
    const l = await locks.acquire(t, 'r1');
    const j1 = locks.join(t, []);
    const j2 = locks.join(t, []);
    let n = 0;
    j1.processed.then(() => { n++; });
    j2.processed.then(() => { n++; });
    locks.release(l);
    await j1.processed;
    await j2.processed;
    expect(n).toBe(2);
    const l2 = await locks.acquire(t, 'r2');
    locks.release(l2);
  });

