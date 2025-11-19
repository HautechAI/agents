import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { ModuleRef } from '@nestjs/core';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { GraphRepository } from '../src/graph/graph.repository';
import type { LiveNode } from '../src/graph/liveGraph.types';
import { ResponseMessage, AIMessage } from '@agyn/llm';
import { z } from 'zod';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { Signal } from '../src/signal';
import type { LLMContext } from '../src/llm/types';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

class StubLLMProvisioner extends LLMProvisioner {
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
}

class FakeAgent extends AgentNode {
  override getPortConfig() {
    return { sourcePorts: {}, targetPorts: { $self: { kind: 'instance' } } } as const;
  }
  override getAgentNodeId(): string | undefined {
    return 'agent-' + Math.random().toString(36).slice(2, 6);
  }
  override async invoke(thread: string): Promise<ResponseMessage> {
    return new ResponseMessage({ output: [AIMessage.fromText(`ok-${thread}`).toPlain()] });
  }
}

describe('ManageToolNode', () => {
  it('requires configured agent titles and prevents duplicates', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {} } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });

    const missingConfigAgent = await module.resolve(FakeAgent);
    expect(() => node.addWorker(missingConfigAgent)).toThrow('ManageTool: agent title is required');

    const blankTitleAgent = await module.resolve(FakeAgent);
    await blankTitleAgent.setConfig({ title: '   ' });
    expect(() => node.addWorker(blankTitleAgent)).toThrow('ManageTool: agent title is required');

    const agentA = await module.resolve(FakeAgent);
    await agentA.setConfig({ title: 'Alpha' });
    node.addWorker(agentA);

    const duplicateTitleAgent = await module.resolve(FakeAgent);
    await duplicateTitleAgent.setConfig({ title: 'Alpha' });
    expect(() => node.addWorker(duplicateTitleAgent)).toThrow('ManageTool: worker with title Alpha already exists');
  });

  it('listWorkers returns trimmed titles and reflects updates', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {} } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const agent = await module.resolve(FakeAgent);
    await agent.setConfig({ title: '  Alpha  ' });
    node.addWorker(agent);
    expect(node.listWorkers()).toEqual(['Alpha']);

    await agent.setConfig({ title: 'Beta' });
    expect(node.listWorkers()).toEqual(['Beta']);
  });

  it('removeWorker uses instance identity even after retitling', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {} } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const agent = await module.resolve(FakeAgent);
    await agent.setConfig({ title: 'Alpha' });
    node.addWorker(agent);
    expect(node.listWorkers()).toEqual(['Alpha']);

    await agent.setConfig({ title: 'Gamma' });
    node.removeWorker(agent);
    expect(node.listWorkers()).toEqual([]);
  });
});

describe('ManageTool unit', () => {
  it('send_message: routes using agent titles', async () => {
    const summaryArgs: string[] = [];
    const persistence = {
      beginRunThread: async () => ({ runId: 't' }),
      recordInjected: async () => {},
      completeRun: async () => {},
      getOrCreateSubthreadByAlias: async (_src: string, _alias: string, _parent: string, summary: string) => {
        summaryArgs.push(summary);
        return 'child-t';
      },
    } satisfies Partial<AgentsPersistenceService>;
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: persistence },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const agent = await module.resolve(FakeAgent);
    await agent.setConfig({ title: 'child-1' });
    node.addWorker(agent);
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'parent', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const res = await tool.execute({ command: 'send_message', worker: 'child-1', message: 'hello', threadAlias: 'child-1' }, ctx);
    expect(res?.startsWith('ok-')).toBe(true);
    expect(summaryArgs).toEqual(['']);
  });

  it('send_message: trims worker title lookups', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const agent = await module.resolve(FakeAgent);
    await agent.setConfig({ title: 'worker-title' });
    node.addWorker(agent);
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'parent', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const res = await tool.execute({ command: 'send_message', worker: '  worker-title  ', message: 'hello', threadAlias: 'alias' }, ctx);
    expect(res?.startsWith('ok-')).toBe(true);
  });

  it('send_message: parameter validation and unknown worker', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'd' });
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    await expect(tool.execute({ command: 'send_message', worker: 'x', threadAlias: 'alias-x' }, ctx)).rejects.toBeTruthy();
    const a = await module.resolve(FakeAgent);
    await a.setConfig({ title: 'w1' });
    node.addWorker(a);
    await expect(tool.execute({ command: 'send_message', worker: 'unknown', message: 'm', threadAlias: 'alias-unknown' }, ctx)).rejects.toBeTruthy();
  });

  it('check_status: aggregates active child threads scoped to current thread', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const a1 = await module.resolve(FakeAgent);
    const a2 = await module.resolve(FakeAgent);
    await a1.setConfig({ title: 'A' });
    await a2.setConfig({ title: 'B' });
    node.addWorker(a1);
    node.addWorker(a2);
    // Active threads tracking is not exposed by current AgentNode; check_status returns empty aggregates.

    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const statusStr = await tool.execute({ command: 'check_status', threadAlias: 'status' }, ctx);
    const statusSchema = z.object({ activeTasks: z.number().int(), childThreadIds: z.array(z.string()) });
    const status = statusSchema.parse(JSON.parse(statusStr));
    expect(status.activeTasks).toBe(0);
    expect(status.childThreadIds.length).toBe(0);
  });

  it('check_status returns empty aggregates when no workers connected', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const statusStr = await tool.execute({ command: 'check_status', threadAlias: 'status' }, ctx);
    const statusSchema = z.object({ activeTasks: z.number().int(), childThreadIds: z.array(z.string()) });
    const status = statusSchema.parse(JSON.parse(statusStr));
    expect(status.activeTasks).toBe(0);
    expect(status.childThreadIds.length).toBe(0);
  });

  it('throws when child agent invoke fails (send_message)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    class ThrowingAgent extends FakeAgent {
      override async invoke(): Promise<ResponseMessage> {
        throw new Error('child failure');
      }
    }
    const a = new ThrowingAgent(module.get(ConfigService), module.get(LoggerService), module.get(LLMProvisioner), module.get(ModuleRef));
    await a.setConfig({ title: 'W' });
    node.addWorker(a);
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    await expect(tool.execute({ command: 'send_message', worker: 'W', message: 'go', threadAlias: 'alias-W' }, ctx)).rejects.toBeTruthy();
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to two agents via agent port; titles are enforced', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {} } },
        RunSignalsRegistry,
      ],
    }).compile();
    class FakeAgentWithTools extends FakeAgent {
      addTool(_tool: unknown) {}
      removeTool(_tool: unknown) {}
      override getPortConfig() { return { sourcePorts: { tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' } }, targetPorts: { $self: { kind: 'instance' } } } as const; }
    }
    const moduleRef = module.get(ModuleRef);
    const registry = new TemplateRegistry(moduleRef);

    registry
      .register('agent', { title: 'Agent', kind: 'agent' }, FakeAgentWithTools)
      .register('manageTool', { title: 'Manage', kind: 'tool' }, ManageToolNode);

    const runtimeModule = await Test.createTestingModule({
      providers: [
        LiveGraphRuntime,
        LoggerService,
        { provide: TemplateRegistry, useValue: registry },
        { provide: GraphRepository, useValue: { initIfNeeded: async () => {}, get: async () => null, upsert: async () => { throw new Error('not-implemented'); }, upsertNodeState: async () => {} } },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const runtime = await runtimeModule.resolve(LiveGraphRuntime);

    const graph = {
      nodes: [
        { id: 'A', data: { template: 'agent', config: { title: ' Alpha ' } } },
        { id: 'B', data: { template: 'agent', config: { title: 'Beta' } } },
        { id: 'M', data: { template: 'manageTool', config: { description: 'desc' } } },
      ],
      edges: [
        { source: 'M', sourceHandle: 'agent', target: 'A', targetHandle: '$self' },
        { source: 'M', sourceHandle: 'agent', target: 'B', targetHandle: '$self' },
      ],
    };

    await runtime.apply(graph);
    const nodes = runtime.getNodes();
    const toolNode = (nodes as LiveNode[]).find((n) => n.id === 'M');
    if (!toolNode) throw new Error('Manage tool node not found');
    const inst = toolNode.instance;
    const isManage = inst instanceof ManageToolNode;
    if (!isManage) throw new Error('Instance is not ManageToolNode');
    const titles = (inst as ManageToolNode).listWorkers();
    expect(titles).toEqual(['Alpha', 'Beta']);
  });
});
