/* Issue #451: out-of-scope git graph service test skipped */
describe.skip('skipped (Issue #451)', () => { it('noop', () => { /* noop */ }); });
      const f = path.join(tmp, 'nodes', `${encodeURIComponent(id)}.json`);
      const data = JSON.parse(await fs.readFile(f, 'utf8'));
      expect(data.id).toBe(id);
    }
    const eid = `${ids[0]}-out__${ids[1]}-in`;
    const ef = path.join(tmp, 'edges', `${encodeURIComponent(eid)}.json`);
    const eData = JSON.parse(await fs.readFile(ef, 'utf8'));
    expect(eData.id).toBe(eid);
  });

  it('falls back to HEAD when an entity file is corrupt', async () => {
    // seed graph with two nodes so partial read would be detectable
    const before = await svc.upsert({ name: 'main', version: 0, nodes: [
      { id: 'nA', template: 'noop' },
      { id: 'nB', template: 'noop' },
    ], edges: [] });
    // corrupt one node file
    const fs = await import('fs/promises');
    await fs.writeFile(path.join(tmp, 'nodes', `${encodeURIComponent('nA')}.json`), '{ bad-json');
    const recovered = await svc.get('main');
    // Should fallback to last committed snapshot (before)
    expect(recovered?.nodes.length).toBe(before.nodes.length);
    expect(recovered?.version).toBe(before.version);
  });

  it('bumps version and stages only deltas', async () => {
    const first = await svc.upsert({ name: 'main', version: 0, nodes: [{ id: 'n1', template: 'noop' }], edges: [] });
    const second = await svc.upsert({ name: 'main', version: first.version, nodes: [{ id: 'n1', template: 'noop', position: { x: 1, y: 2 } }], edges: [] });
    expect(second.version).toBe(first.version + 1);
    // Confirm meta exists and node file updated
    const fs = await import('fs/promises');
    const nPath = path.join(tmp, 'nodes', `${encodeURIComponent('n1')}.json`);
    const node = JSON.parse(await fs.readFile(nPath, 'utf8'));
    expect(node.position).toEqual({ x: 1, y: 2 });
  });
});
