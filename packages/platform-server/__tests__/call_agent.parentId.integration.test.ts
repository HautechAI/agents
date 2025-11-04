import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service';
import { CallAgentTool } from '../src/graph/nodes/tools/call_agent/call_agent.node';
import { ResponseMessage } from '@agyn/llm';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { PrismaService } from '../src/core/services/prisma.service';

// Prisma stub reused from unit test
function createPrismaStub() {
  const threads: Array<{ id: string; alias: string; parentId: string | null; createdAt: Date }> = [];
  const runs: Array<{ id: string; threadId: string; status: string; createdAt: Date; updatedAt: Date }> = [];
  const messages: Array<{ id: string; kind: string; text: string | null; source: any; createdAt: Date }> = [];
  const runMessages: Array<{ runId: string; messageId: string; type: string; createdAt: Date }> = [];

  let idSeq = 1;
  const newId = () => `t-${idSeq++}`;

  const prisma: any = {
    thread: {
      findUnique: async ({ where: { alias } }: any) => threads.find((t) => t.alias === alias) || null,
      create: async ({ data }: any) => {
        const row = { id: newId(), alias: data.alias, parentId: data.parentId ?? null, createdAt: new Date() };
        threads.push(row);
        return row;
      },
      findMany: async (_args: any) => threads,
    },
    run: {
      create: async ({ data }: any) => {
        const row = { id: `r-${idSeq++}`, threadId: data.threadId, status: data.status ?? 'running', createdAt: new Date(), updatedAt: new Date() };
        runs.push(row);
        return row;
      },
      update: async ({ where: { id }, data }: any) => {
        const r = runs.find((x) => x.id === id);
        if (r && data.status) r.status = data.status;
        if (r) r.updatedAt = new Date();
        return r;
      },
      findMany: async () => runs,
    },
    message: {
      create: async ({ data }: any) => {
        const row = { id: `m-${idSeq++}`, kind: data.kind, text: data.text ?? null, source: data.source, createdAt: new Date() };
        messages.push(row);
        return row;
      },
      findMany: async ({ where: { id: { in: ids } } }: any) => messages.filter((m) => ids.includes(m.id)),
    },
    runMessage: {
      create: async ({ data }: any) => {
        const row = { runId: data.runId, messageId: data.messageId, type: data.type, createdAt: new Date() };
        runMessages.push(row);
        return row;
      },
      findMany: async ({ where: { runId, type } }: any) => runMessages.filter((rm) => rm.runId === runId && rm.type === type),
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => fn({ thread: prisma.thread, run: prisma.run, message: prisma.message, runMessage: prisma.runMessage }),
    _store: { threads, runs, messages, runMessages },
  };
  return prisma;
}

class StubPrismaService extends PrismaService {
  constructor(private stub: any) {
    super({} as any, {} as any);
  }
  override getClient(): any {
    return this.stub;
  }
}

class FakeAgentWithPersistence {
  constructor(private persistence: AgentsPersistenceService) {}
  async invoke(thread: string, _messages: any[]): Promise<ResponseMessage> {
    await this.persistence.beginRun(thread, [{ role: 'user', text: 'work' }]);
    return ResponseMessage.fromText('OK');
  }
}

describe('call_agent integration: creates child thread with parentId', () => {
  it('creates parent and child threads and sets child.parentId', async () => {
    const stub = createPrismaStub();
    const persistence = new AgentsPersistenceService(new StubPrismaService(stub));
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'sync' });
    // Attach fake agent that persists runs/threads
    // @ts-ignore private for unit/integration
    tool['setAgent'](new FakeAgentWithPersistence(persistence) as any);

    const dynamic = tool.getTool();
    const res = await dynamic.execute({ input: 'do', childThreadId: 'childX' }, { threadId: 'parentX' } as any);
    expect(res).toBe('OK');

    const parent = stub._store.threads.find((t: any) => t.alias === 'parentX');
    const child = stub._store.threads.find((t: any) => t.alias === 'parentX__childX');
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
  });
});

