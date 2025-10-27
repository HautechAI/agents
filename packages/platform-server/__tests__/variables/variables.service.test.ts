import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VariablesService } from '../../src/variables/variables.service';
import { GraphRepository } from '../../src/graph/graph.repository';
import { PrismaService } from '../../src/core/services/prisma.service';

class MockGraphRepo extends GraphRepository {
  async initIfNeeded(): Promise<void> {}
  private g: any = { name: 'main', version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: { items: [] } };
  async get(): Promise<any> { return this.g; }
  async upsert(): Promise<any> { return this.g; }
  async upsertNodeState(): Promise<void> {}
  async getVariables(): Promise<any> { return this.g.variables; }
  async upsertVariables(_name: string, items: any[], _v?: number): Promise<any> { this.g.variables = { items }; this.g.version++; return this.g; }
}

class MockPrisma extends PrismaService {
  private store = new Map<string, string>();
  getClient(): any {
    return {
      variable: {
        findMany: async ({ where }: any) => {
          const out: any[] = [];
          for (const [k, v] of this.store.entries()) out.push({ graphName: where.graphName, key: k, value: v });
          return out;
        },
        upsert: async ({ where, create, update }: any) => {
          const key = where.graphName_key.key;
          const val = (create?.value ?? update?.value) as string;
          this.store.set(key, val);
        },
        delete: async ({ where }: any) => {
          const key = where.graphName_key.key; this.store.delete(key);
        },
      },
    };
  }
}

describe('VariablesService transitions', () => {
  let svc: VariablesService;
  let graphs: MockGraphRepo;
  let prisma: MockPrisma;
  beforeEach(() => {
    graphs = new MockGraphRepo();
    prisma = new MockPrisma({} as any, {} as any);
    svc = new VariablesService(graphs as any, prisma as any);
  });

  it('creates local variable and writes prisma', async () => {
    await svc.createVariable('main', { key: 'A', source: 'local', value: 'x' });
    const list = await svc.getVariables('main');
    expect(list.find((v) => v.key === 'A')?.value).toBe('x');
  });

  it('transitions local -> graph deletes prisma', async () => {
    await svc.createVariable('main', { key: 'B', source: 'local', value: 'x' });
    await svc.updateVariable('main', 'B', { key: 'B', source: 'graph', value: 'y' });
    const list = await svc.getVariables('main');
    const b = list.find((v) => v.key === 'B');
    expect(b?.source).toBe('graph');
  });

  it('delete local variable removes prisma row', async () => {
    await svc.createVariable('main', { key: 'C', source: 'local', value: 'x' });
    await svc.deleteVariable('main', 'C');
    const list = await svc.getVariables('main');
    expect(list.find((v) => v.key === 'C')).toBeUndefined();
  });
});

