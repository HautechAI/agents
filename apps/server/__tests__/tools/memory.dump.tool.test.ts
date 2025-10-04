import { describe, it, expect } from 'vitest';
import type { Db } from 'mongodb';
import { MemoryService, type MemoryDoc } from '../../src/services/memory.service';
import { MemoryAppendTool } from '../../src/tools/memory/memory_append.tool';
import { MemoryDumpTool } from '../../src/tools/memory/memory_dump.tool';
import { LoggerService } from '../../src/services/logger.service';

// In-memory fake Db compatible with MemoryService for deterministic tests (copied minimal from append test)
class FakeCollection<T extends MemoryDoc> {
  private store = new Map<string, any>();
  async indexes() { return []; }
  async createIndex() { return 'idx'; }
  private keyOf(filter: any) { return JSON.stringify(filter); }
  async findOne(filter: any, _opts?: any) {
    const k = this.keyOf(filter);
    return this.store.get(k) ?? null;
  }
  async findOneAndUpdate(filter: any, update: any, options: any) {
    const k = this.keyOf(filter);
    let doc = this.store.get(k);
    if (!doc && options?.upsert) {
      doc = { ...filter, data: {}, dirs: {} };
      if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
      this.store.set(k, doc);
    }
    if (!doc) return { value: null } as any;
    if (update.$set) for (const [p, v] of Object.entries(update.$set)) setByPathFlat(doc, p as string, v);
    if (update.$unset) for (const p of Object.keys(update.$unset)) unsetByPathFlat(doc, p);
    return { value: doc } as any;
  }
  async updateOne(filter: any, update: any, options?: any) {
    const k = this.keyOf(filter);
    let doc = this.store.get(k);
    if (!doc && options?.upsert) {
      doc = { ...filter, data: {}, dirs: {} };
      this.store.set(k, doc);
    }
    if (!doc) return { matchedCount: 0, modifiedCount: 0 } as any;
    if (update.$set) for (const [p, v] of Object.entries(update.$set)) setByPathFlat(doc, p as string, v);
    if (update.$unset) for (const p of Object.keys(update.$unset)) unsetByPathFlat(doc, p);
    return { matchedCount: 1, modifiedCount: 1 } as any;
  }
}
class FakeDb implements Db {
  private cols = new Map<string, any>();
  collection<T>(name: string) {
    if (!this.cols.has(name)) this.cols.set(name, new FakeCollection<T>());
    return this.cols.get(name) as any;
  }
  [k: string]: any
}
function setByPath(obj: any, path: string, value: any) { const parts = path.split('.'); let curr = obj; for (let i=0;i<parts.length-1;i++){ const p=parts[i]; curr[p]=curr[p]??{}; curr=curr[p]; } curr[parts[parts.length-1]] = value; }
function setByPathFlat(doc: any, path: string, value: any) {
  const [root, ...rest] = path.split('.');
  if (root === 'data' || root === 'dirs') { const key = rest.join('.'); doc[root] = doc[root] || {}; doc[root][key] = value; return; }
  setByPath(doc, path, value);
}
function unsetByPath(obj: any, path: string) { const parts = path.split('.'); let curr = obj; for (let i=0;i<parts.length-1;i++){ const p=parts[i]; if(!curr[p]) return; curr=curr[p]; } delete curr[parts[parts.length-1]]; }
function unsetByPathFlat(doc: any, path: string) { const [root, ...rest] = path.split('.'); if (root === 'data' || root === 'dirs') { const key = rest.join('.'); if (doc[root]) delete doc[root][key]; return; } unsetByPath(doc, path); }


describe('memory_dump tool: shallow diagnostics', () => {
  const mkTools = () => {
    const db = new FakeDb() as unknown as Db;
    const factory = (opts: { threadId?: string }) => new MemoryService(db, 'nodeT', opts.threadId ? 'perThread' : 'global', opts.threadId);
    const logger = new LoggerService();
    const append = new MemoryAppendTool(logger);
    append.setMemorySource(factory);
    const dump = new MemoryDumpTool(logger);
    dump.setMemorySource(factory);
    const cfg = { configurable: { thread_id: 'T1' } } as any;
    return { append: append.init(), dump: dump.init(), cfg };
  };

  it('After append under /users/U..., dump at root includes users key', async () => {
    const { append, dump, cfg } = mkTools();
    await append.invoke({ path: '/users/U08ES_test', data: 'hello' }, cfg);
    const res = await dump.invoke({ path: '/' }, cfg);
    const obj = JSON.parse(String(res));
    expect(obj).toBeTruthy();
    expect(Array.isArray(obj.keys)).toBe(true);
    expect(obj.keys).toContain('users');
    expect(obj.counts.total).toBeGreaterThan(0);
  });
});
