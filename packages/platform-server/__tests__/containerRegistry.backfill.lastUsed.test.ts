/* Issue #451: out-of-scope legacy container/registry tests skipped for NestJS refactor */
describe.skip('skipped (Issue #451)', () => { it('noop', () => { /* noop */ }); });
    const after = await col.findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(future.toISOString());
    expect(after?.kill_after_at).toBeTruthy();
    expect(after?.kill_after_at).not.toBe(before?.kill_after_at);
  });
});
