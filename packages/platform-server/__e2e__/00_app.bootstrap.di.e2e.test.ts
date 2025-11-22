import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { ModuleRef } from '@nestjs/core';

import { AppModule } from '../src/bootstrap/app.module';
import { EventsModule } from '../src/events/events.module';
import { StartupRecoveryService } from '../src/core/services/startupRecovery.service';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { EventsBusService } from '../src/events/events-bus.service';
import type { LoggerService } from '../src/core/services/logger.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import type { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { ConfigService } from '../src/core/services/config.service';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { RunSignalsRegistry } from '../src/agents/run-signals.service';

const REQUIRED_ENV = {
  LLM_PROVIDER: 'openai',
  AGENTS_DATABASE_URL: 'postgres://localhost:5432/test',
  NCPS_ENABLED: 'false',
  CONTAINERS_CLEANUP_ENABLED: 'false',
} as const;

const originalEnv: Partial<Record<keyof typeof REQUIRED_ENV, string | undefined>> = {};

const createSubscribeMock = () => {
  const cleanup = vi.fn();
  const subscribe = vi.fn(() => cleanup);
  return { subscribe, cleanup } as const;
};

describe('App bootstrap DI smoke test', () => {
  beforeAll(() => {
    for (const [key, value] of Object.entries(REQUIRED_ENV)) {
      const k = key as keyof typeof REQUIRED_ENV;
      originalEnv[k] = process.env[k];
      process.env[k] = value;
    }
  });

  afterAll(() => {
    for (const key of Object.keys(REQUIRED_ENV) as Array<keyof typeof REQUIRED_ENV>) {
      const prev = originalEnv[key];
      if (typeof prev === 'string') process.env[key] = prev;
      else delete process.env[key];
    }
  });

  it('asserts AppModule boot wiring stays intact', () => {
    const reflector = new Reflector();
    const appModuleImports = reflector.get<unknown[]>(MODULE_METADATA.IMPORTS, AppModule) ?? [];
    expect(appModuleImports).toContain(EventsModule);

    const eventsBusSubscriptions = {
      runEvents: createSubscribeMock(),
      toolOutputChunk: createSubscribeMock(),
      toolOutputTerminal: createSubscribeMock(),
      reminderCount: createSubscribeMock(),
      nodeState: createSubscribeMock(),
      threadCreated: createSubscribeMock(),
      threadUpdated: createSubscribeMock(),
      messageCreated: createSubscribeMock(),
      runStatusChanged: createSubscribeMock(),
      threadMetrics: createSubscribeMock(),
      threadMetricsAncestors: createSubscribeMock(),
    };

    const eventsBusStub = {
      subscribeToRunEvents: eventsBusSubscriptions.runEvents.subscribe,
      subscribeToToolOutputChunk: eventsBusSubscriptions.toolOutputChunk.subscribe,
      subscribeToToolOutputTerminal: eventsBusSubscriptions.toolOutputTerminal.subscribe,
      subscribeToReminderCount: eventsBusSubscriptions.reminderCount.subscribe,
      subscribeToNodeState: eventsBusSubscriptions.nodeState.subscribe,
      subscribeToThreadCreated: eventsBusSubscriptions.threadCreated.subscribe,
      subscribeToThreadUpdated: eventsBusSubscriptions.threadUpdated.subscribe,
      subscribeToMessageCreated: eventsBusSubscriptions.messageCreated.subscribe,
      subscribeToRunStatusChanged: eventsBusSubscriptions.runStatusChanged.subscribe,
      subscribeToThreadMetrics: eventsBusSubscriptions.threadMetrics.subscribe,
      subscribeToThreadMetricsAncestors: eventsBusSubscriptions.threadMetricsAncestors.subscribe,
    } as unknown as EventsBusService;

    const loggerStub = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as LoggerService;
    (loggerStub as Record<string, unknown>).child = vi.fn(() => loggerStub);

    const prismaServiceStub = {
      getClient: vi.fn(),
    } as unknown as PrismaService;

    const startupRecovery = new StartupRecoveryService(prismaServiceStub, loggerStub, eventsBusStub);
    expect(Reflect.get(startupRecovery as Record<string, unknown>, 'eventsBus')).toBe(eventsBusStub);

    const llmProvisionerStub = {} as LLMProvisioner;
    const configServiceStub = {} as ConfigService;
    const moduleRefStub = {
      get: vi.fn(),
      resolve: vi.fn(),
      create: vi.fn(),
    } as unknown as ModuleRef;
    const agentsPersistenceStub = {} as AgentsPersistenceService;
    const runSignalsStub = {} as RunSignalsRegistry;

    const agentNode = new AgentNode(
      configServiceStub,
      loggerStub,
      llmProvisionerStub,
      moduleRefStub,
      agentsPersistenceStub,
      runSignalsStub,
    );
    expect(Reflect.get(agentNode as Record<string, unknown>, 'llmProvisioner')).toBe(llmProvisionerStub);

    const liveGraphRuntimeStub = {} as LiveGraphRuntime;
    const threadsMetricsStub = {} as ThreadsMetricsService;
    const graphPrismaStub = prismaServiceStub;

    const gateway = new GraphSocketGateway(
      loggerStub,
      liveGraphRuntimeStub,
      threadsMetricsStub,
      graphPrismaStub,
      eventsBusStub,
    );

    gateway.onModuleInit();
    for (const subscription of Object.values(eventsBusSubscriptions)) {
      expect(subscription.subscribe).toHaveBeenCalledTimes(1);
    }

    gateway.onModuleDestroy();
    for (const subscription of Object.values(eventsBusSubscriptions)) {
      expect(subscription.cleanup).toHaveBeenCalledTimes(1);
    }
  });
});
