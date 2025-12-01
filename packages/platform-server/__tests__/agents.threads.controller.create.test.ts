import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';

const runEventsStub = {
  getRunSummary: async () => null,
  listRunEvents: async () => ({ items: [], nextCursor: null }),
  getToolOutputSnapshot: async () => null,
};

type AgentNodeInstanceStub = {
  status: string;
  invoke: ReturnType<typeof vi.fn>;
};

type LiveNodeStub = {
  id: string;
  template: string;
  instance?: AgentNodeInstanceStub | Record<string, unknown>;
};

type SetupOptions = {
  liveNode?: LiveNodeStub | null;
  templateKind?: 'agent' | 'tool';
  createError?: Error;
};

async function setup(options: SetupOptions = {}) {
  const agentNodeId = 'agent-1';
  const invoke = vi.fn(async () => 'queued');
  const liveNode: LiveNodeStub | null =
    options.liveNode === undefined
      ? { id: agentNodeId, template: 'agent.template', instance: { status: 'ready', invoke } }
      : options.liveNode;

  const runtimeStub = {
    getNode: vi.fn(() => liveNode ?? undefined),
    getNodes: vi.fn(() => (liveNode ? [liveNode] : [])),
  } satisfies Partial<LiveGraphRuntime> & { getNodes: () => LiveNodeStub[] };

  const getOrCreateThreadByAlias = vi.fn(async () => 'thread-created');
  if (options.createError) {
    getOrCreateThreadByAlias.mockImplementation(async () => {
      throw options.createError;
    });
  }

  const ensureAssignedAgent = vi.fn(async () => {});

  const templateRegistryStub = {
    getMeta: vi.fn((template: string) => {
      if (template === 'agent.template') {
        return { kind: options.templateKind ?? 'agent', title: 'Agent Template' };
      }
      if (template === liveNode?.template && options.templateKind) {
        return { kind: options.templateKind, title: 'Provided Template' };
      }
      return undefined;
    }),
  } satisfies Pick<TemplateRegistry, 'getMeta'>;

  const module = await Test.createTestingModule({
    controllers: [AgentsThreadsController],
    providers: [
      {
        provide: AgentsPersistenceService,
        useValue: {
          listThreads: async () => [],
          listChildren: async () => [],
          listRuns: async () => [],
          listRunMessages: async () => [],
          getThreadsMetrics: async () => ({}),
          getThreadsAgentDescriptors: async () => ({}),
          updateThread: async () => ({ previousStatus: 'open', status: 'open' }),
          getThreadById: async () => null,
          getLatestAgentNodeIdForThread: async () => null,
          getRunById: async () => null,
          ensureAssignedAgent,
          getOrCreateThreadByAlias,
        },
      },
      { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
      { provide: RunEventsService, useValue: runEventsStub },
      { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      { provide: LiveGraphRuntime, useValue: runtimeStub },
      { provide: TemplateRegistry, useValue: templateRegistryStub },
    ],
  }).compile();

  const controller = await module.resolve(AgentsThreadsController);
  const response = { setHeader: vi.fn() } as unknown as Response;

  return {
    controller,
    runtimeStub,
    getOrCreateThreadByAlias,
    ensureAssignedAgent,
    response,
  };
}

describe('AgentsThreadsController POST /api/agents/threads', () => {
  it('creates a thread and assigns the agent when runtime is ready', async () => {
    const { controller, getOrCreateThreadByAlias, ensureAssignedAgent, response } = await setup();

    const result = await controller.createThread({ agentNodeId: 'agent-1', summary: '  New conversation  ' }, response);

    expect(result).toEqual({ id: 'thread-created' });
    expect(getOrCreateThreadByAlias).toHaveBeenCalledTimes(1);
    const args = getOrCreateThreadByAlias.mock.calls[0];
    expect(args[0]).toBe('manual');
    expect(args[1]).toMatch(/^manual:agent-1:[0-9a-fA-F-]{36}$/);
    expect(args[2]).toBe('New conversation');
    expect(ensureAssignedAgent).toHaveBeenCalledWith('thread-created', 'agent-1');
    expect(response.setHeader).toHaveBeenCalledWith('Location', '/api/agents/threads/thread-created');
  });

  it('defaults summary to empty string when omitted', async () => {
    const { controller, getOrCreateThreadByAlias, response } = await setup();

    await controller.createThread({ agentNodeId: 'agent-1' }, response);

    const args = getOrCreateThreadByAlias.mock.calls[0];
    expect(args[2]).toBe('');
  });

  it('rejects when agent id is unknown', async () => {
    const { controller, response } = await setup({ liveNode: null });

    await expect(controller.createThread({ agentNodeId: 'missing-agent' }, response)).rejects.toMatchObject({
      response: { error: 'invalid_agent' },
    });
  });

  it('rejects when agent node is not an agent template', async () => {
    const { controller, response } = await setup({
      templateKind: 'tool',
      liveNode: { id: 'agent-1', template: 'custom.tool', instance: { status: 'ready' } },
    });

    await expect(controller.createThread({ agentNodeId: 'agent-1' }, response)).rejects.toMatchObject({
      response: { error: 'invalid_agent' },
    });
  });

  it('rejects when agent runtime instance is unavailable', async () => {
    const { controller, response } = await setup({
      liveNode: { id: 'agent-1', template: 'agent.template' },
    });

    await expect(controller.createThread({ agentNodeId: 'agent-1' }, response)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects when agent runtime is not ready', async () => {
    const invoke = vi.fn(async () => 'queued');
    const { controller, response } = await setup({
      liveNode: { id: 'agent-1', template: 'agent.template', instance: { status: 'starting', invoke } },
    });

    await expect(controller.createThread({ agentNodeId: 'agent-1' }, response)).rejects.toMatchObject({
      response: { error: 'agent_unready' },
    });
  });

  it('wraps persistence errors in create_failed', async () => {
    const failingError = new Error('boom');
    const { controller, response } = await setup({ createError: failingError });

    await expect(controller.createThread({ agentNodeId: 'agent-1' }, response)).rejects.toMatchObject({
      response: { error: 'create_failed' },
    });
  });
});
