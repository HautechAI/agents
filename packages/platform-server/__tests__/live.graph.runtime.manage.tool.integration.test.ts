import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';

import type { GraphDefinition } from '../src/shared/types/graph.types';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { buildTemplateRegistry } from '../src/templates';
import { GraphRepository } from '../src/graph/graph.repository';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import type { LLMContext } from '../src/llm/types';
import { Signal } from '../src/signal';
import { EventsBusService } from '../src/events/events-bus.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ResponseMessage } from '@agyn/llm';

class StubGraphRepository extends GraphRepository {
  async initIfNeeded(): Promise<void> {}
  async get(): Promise<null> {
    return null;
  }
  async upsert(): Promise<never> {
    throw new Error('not-implemented');
  }
  async upsertNodeState(): Promise<void> {}
}

class TestEventsBus {
  private listeners = new Set<(payload: { threadId: string; message: { id: string; kind: 'assistant'; text: string; createdAt: Date; runId?: string } }) => void>();

  subscribeToMessageCreated(listener: (payload: { threadId: string; message: { id: string; kind: 'assistant'; text: string; createdAt: Date; runId?: string } }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitMessage(payload: { threadId: string; message: { id: string; kind: 'assistant'; text: string; createdAt: Date; runId?: string } }): void {
    for (const listener of this.listeners) listener(payload);
  }
}

type StoredAssistantEvent = {
  threadId: string;
  runId: string;
  ts: Date;
  message: {
    id: string;
    text: string;
    createdAt: Date;
  };
};

class PrismaMock {
  private readonly events: StoredAssistantEvent[] = [];
  private readonly client = {
    runEvent: {
      findMany: async (args: {
        where: { threadId: string; ts?: { gte?: Date }; eventMessage?: { is?: { role?: string } } };
        orderBy?: { ts: 'asc' | 'desc' };
        take?: number;
      }) => this.findMany(args),
    },
  };

  getClient() {
    return this.client;
  }

  pushAssistantMessage(event: StoredAssistantEvent) {
    this.events.push(event);
  }

  private async findMany(args: {
    where: { threadId: string; ts?: { gte?: Date }; eventMessage?: { is?: { role?: string } } };
    orderBy?: { ts: 'asc' | 'desc' };
    take?: number;
  }) {
    const since = args.where.ts?.gte ?? new Date(0);
    const role = args.where.eventMessage?.is?.role ?? 'assistant';
    const ordered = this.events
      .filter((event) => event.threadId === args.where.threadId)
      .filter((event) => event.ts.getTime() >= since.getTime())
      .sort((a, b) => a.ts.getTime() - b.ts.getTime());

    const sliced = typeof args.take === 'number' ? ordered.slice(0, args.take) : ordered;
    return sliced
      .filter(() => role === 'assistant')
      .map((event) => ({
        runId: event.runId,
        eventMessage: {
          role: 'assistant',
          message: {
            id: event.message.id,
            kind: 'assistant',
            text: event.message.text,
            createdAt: event.message.createdAt,
          },
        },
      }));
  }
}

function buildCtx(): LLMContext {
  return {
    threadId: 'parent-thread',
    runId: 'run-parent',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) },
  } as LLMContext;
}

async function createRuntime(options: { withEventsBus: boolean }) {
  const persistence = {
    getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread'),
    updateThreadChannelDescriptor: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentsPersistenceService;
  const prisma = new PrismaMock();
  const providers: Array<{ provide: unknown; useValue?: unknown; useClass?: unknown }> = [
    ManageFunctionTool,
    ManageToolNode,
    { provide: AgentsPersistenceService, useValue: persistence },
    { provide: PrismaService, useValue: prisma as unknown as PrismaService },
  ];
  let eventsBus: TestEventsBus | undefined;
  if (options.withEventsBus) {
    eventsBus = new TestEventsBus();
    providers.push({ provide: EventsBusService, useValue: eventsBus as unknown as EventsBusService });
  }

  const testingModule = await Test.createTestingModule({ providers }).compile();
  const moduleRef = testingModule.get(ModuleRef);
  const registry = buildTemplateRegistry({ moduleRef });
  const runtime = new LiveGraphRuntime(
    registry,
    new StubGraphRepository(),
    moduleRef,
    { resolve: async (input: unknown) => ({ output: input, report: {} as Record<string, unknown> }) } as any,
  );

  const graph: GraphDefinition = {
    nodes: [
      {
        id: 'manage',
        data: {
          template: 'manageTool',
          config: {
            mode: 'sync',
            syncTimeoutMs: 1000,
            syncMaxMessages: 1,
            asyncPrefix: 'From {{agentTitle}}: ',
            showCorrelationInOutput: false,
          },
        },
      },
    ],
    edges: [],
  };

  await runtime.apply(graph);
  const node = runtime.getNodeInstance('manage') as ManageToolNode;
  return { module: testingModule, runtime, node, persistence, eventsBus, prisma };
}

describe('LiveGraphRuntime -> Manage tool DI integration', () => {
  it('uses EventsBusService subscription for sync responses when available', async () => {
    const harness = await createRuntime({ withEventsBus: true });
    const tool = harness.node.getTool();
    const eventsBus = harness.eventsBus!;

    const worker = {
      config: { title: 'worker-1' },
      async invoke(threadId: string) {
        setTimeout(() => {
          eventsBus.emitMessage({
            threadId,
            message: {
              id: 'msg-1',
              kind: 'assistant',
              text: 'bus-response',
              createdAt: new Date(),
              runId: 'child-run',
            },
          });
        }, 10);
        return ResponseMessage.fromText('queued');
      },
    } as unknown as ManageToolNode['getWorkers'][number];

    harness.node.addWorker(worker);

    const result = await tool.execute(
      { command: 'send_message', worker: 'worker-1', message: 'ping' },
      buildCtx(),
    );

    expect(result).toBe('Response from: worker-1\nbus-response');
    await harness.module.close();
  });

  it('falls back to Prisma polling when EventsBusService is missing', async () => {
    const harness = await createRuntime({ withEventsBus: false });
    const tool = harness.node.getTool();
    const prisma = harness.prisma;

    const worker = {
      config: { title: 'worker-2' },
      async invoke(threadId: string) {
        setTimeout(() => {
          prisma.pushAssistantMessage({
            threadId,
            runId: 'child-run-2',
            ts: new Date(),
            message: {
              id: 'msg-2',
              text: 'fallback-response',
              createdAt: new Date(),
            },
          });
        }, 10);
        return ResponseMessage.fromText('queued');
      },
    } as unknown as ManageToolNode['getWorkers'][number];

    harness.node.addWorker(worker);

    const warnSpy = vi.spyOn((tool as any).logger, 'warn');

    const result = await tool.execute(
      { command: 'send_message', worker: 'worker-2', message: 'ping' },
      buildCtx(),
    );

    expect(result).toBe('Response from: worker-2\nfallback-response');
    expect(warnSpy).toHaveBeenCalledWith('Manage: EventsBusService missing; using polling fallback');

    await harness.module.close();
    warnSpy.mockRestore();
  });
});
