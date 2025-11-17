import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server as HTTPServer } from 'http';
import type { AddressInfo } from 'net';
import { io as createClient, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import type { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';
import { PrismaClient, ToolExecStatus } from '@prisma/client';
import { RunEventsService } from '../src/events/run-events.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { TemplateRegistry } from '../src/graph/templateRegistry';
import type { GraphRepository } from '../src/graph/graph.repository';
import { HumanMessage, AIMessage } from '@agyn/llm';

type MetricsPayload = { activity: 'working' | 'waiting' | 'idle'; remindersCount: number };

const createLoggerStub = (): LoggerService =>
  ({
    info: () => undefined,
    debug: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  }) as LoggerService;

const createRuntimeStub = (): LiveGraphRuntime =>
  ({
    subscribe: () => () => undefined,
  }) as unknown as LiveGraphRuntime;

const createMetricsDouble = () => {
  const store = new Map<string, MetricsPayload>();
  const service = {
    getThreadsMetrics: async (ids: string[]) => {
      const out: Record<string, MetricsPayload> = {};
      for (const id of ids) out[id] = store.get(id) ?? { activity: 'idle', remindersCount: 0 };
      return out;
    },
  } as unknown as ThreadsMetricsService;
  return {
    service,
    set(id: string, value: MetricsPayload) {
      store.set(id, value);
    },
  };
};

const createPrismaStub = () =>
  ({
    getClient: () => ({
      $queryRaw: async () => [],
    }),
  }) as unknown as PrismaService;

const waitForEvent = <T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });

const subscribeRooms = async (socket: Socket, rooms: string[]) => {
  socket.emit('subscribe', { rooms });
  await new Promise((resolve) => setTimeout(resolve, 20));
};

const closeClient = async (socket: Socket) =>
  new Promise<void>((resolve) => {
    if (!socket.connected) {
      socket.removeAllListeners();
      resolve();
      return;
    }
    socket.once('disconnect', () => {
      socket.removeAllListeners();
      resolve();
    });
    socket.disconnect();
  });

const closeServer = async (server: HTTPServer) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

const DATABASE_URL = process.env.AGENTS_DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('AGENTS_DATABASE_URL must be set for realtime integration tests');
}

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

describe.sequential('GraphSocketGateway realtime integration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('broadcasts thread lifecycle and metrics events to subscribers', async () => {
    const logger = createLoggerStub();
    const runtime = createRuntimeStub();
    const metricsDouble = createMetricsDouble();
    const prismaStub = createPrismaStub();
    const server = createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const gateway = new GraphSocketGateway(logger, runtime, metricsDouble.service, prismaStub);
    gateway.init({ server });

    const client = createClient(`http://127.0.0.1:${port}`, { path: '/socket.io', transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', (err) => reject(err));
    });

    const threadId = randomUUID();
    await subscribeRooms(client, ['threads', `thread:${threadId}`]);

    const createdPromise = waitForEvent<{ thread: { id: string } }>(client, 'thread_created');
    gateway.emitThreadCreated({ id: threadId, alias: 't', summary: null, status: 'open', createdAt: new Date(), parentId: null });
    const createdPayload = await createdPromise;
    expect(createdPayload.thread.id).toBe(threadId);

    const updatedPromise = waitForEvent<{ thread: { summary: string | null } }>(client, 'thread_updated');
    gateway.emitThreadUpdated({ id: threadId, alias: 't', summary: 'Updated summary', status: 'open', createdAt: new Date(), parentId: null });
    const updatedPayload = await updatedPromise;
    expect(updatedPayload.thread.summary).toBe('Updated summary');

    metricsDouble.set(threadId, { activity: 'working', remindersCount: 2 });
    const activityPromise = waitForEvent<{ threadId: string; activity: string }>(client, 'thread_activity_changed');
    const remindersPromise = waitForEvent<{ threadId: string; remindersCount: number }>(client, 'thread_reminders_count');
    gateway.scheduleThreadMetrics(threadId);
    const [activityPayload, remindersPayload] = await Promise.all([activityPromise, remindersPromise]);
    expect(activityPayload).toEqual({ threadId, activity: 'working' });
    expect(remindersPayload).toEqual({ threadId, remindersCount: 2 });

    await closeClient(client);
    (gateway as unknown as { io?: { close(): void } }).io?.close();
    await closeServer(server);
  });

  it('publishes run status changes to thread and run subscribers', async () => {
    const logger = createLoggerStub();
    const runtime = createRuntimeStub();
    const metricsDouble = createMetricsDouble();
    const prismaService = ({ getClient: () => prisma }) as PrismaService;
    const gateway = new GraphSocketGateway(logger, runtime, metricsDouble.service, prismaService);

    const server = createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    gateway.init({ server });

    const threadClient = createClient(`http://127.0.0.1:${port}`, { path: '/socket.io', transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      threadClient.once('connect', resolve);
      threadClient.once('connect_error', reject);
    });

    const thread = await prisma.thread.create({ data: { alias: `thread-${randomUUID()}`, summary: 'initial' } });
    await subscribeRooms(threadClient, [`thread:${thread.id}`]);

    const runEvents = new RunEventsService(prismaService, logger, gateway);
    const templateRegistryStub = ({ getMeta: () => undefined }) as unknown as TemplateRegistry;
    const graphRepositoryStub = ({ get: async () => ({ nodes: [] }) }) as unknown as GraphRepository;
    const agents = new AgentsPersistenceService(prismaService, logger, metricsDouble.service, gateway, templateRegistryStub, graphRepositoryStub, runEvents);

    const startResult = await agents.beginRunThread(thread.id, [HumanMessage.fromText('hello')]);
    const runId = startResult.runId;

    const runClient = createClient(`http://127.0.0.1:${port}`, { path: '/socket.io', transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      runClient.once('connect', resolve);
      runClient.once('connect_error', reject);
    });
    await subscribeRooms(runClient, [`run:${runId}`]);

    const statusFromThread = waitForEvent<{ run: { id: string; status: string } }>(threadClient, 'run_status_changed');
    const statusFromRun = waitForEvent<{ run: { id: string; status: string } }>(runClient, 'run_status_changed');

    await agents.completeRun(runId, 'finished', [AIMessage.fromText('done')]);

    const [threadEvent, runEvent] = await Promise.all([statusFromThread, statusFromRun]);
    expect(threadEvent.run.status).toBe('finished');
    expect(runEvent.run.id).toBe(runId);

    await new Promise((resolve) => setTimeout(resolve, 150));

    await prisma.thread.delete({ where: { id: thread.id } });

    await Promise.all([closeClient(runClient), closeClient(threadClient)]);
    (gateway as unknown as { io?: { close(): void } }).io?.close();
    await closeServer(server);
  });

  it('publishes run timeline append and update events with reconciled payloads', async () => {
    const logger = createLoggerStub();
    const runtime = createRuntimeStub();
    const metricsDouble = createMetricsDouble();
    const prismaService = ({ getClient: () => prisma }) as PrismaService;
    const gateway = new GraphSocketGateway(logger, runtime, metricsDouble.service, prismaService);

    const server = createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    gateway.init({ server });

    const runEvents = new RunEventsService(prismaService, logger, gateway);
    const templateRegistryStub = ({ getMeta: () => undefined }) as unknown as TemplateRegistry;
    const graphRepositoryStub = ({ get: async () => ({ nodes: [] }) }) as unknown as GraphRepository;
    const agents = new AgentsPersistenceService(prismaService, logger, metricsDouble.service, gateway, templateRegistryStub, graphRepositoryStub, runEvents);

    const thread = await prisma.thread.create({ data: { alias: `thread-${randomUUID()}`, summary: 'timeline' } });
    const startResult = await agents.beginRunThread(thread.id, [HumanMessage.fromText('start')]);
    const runId = startResult.runId;

    const threadClient = createClient(`http://127.0.0.1:${port}`, { path: '/socket.io', transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      threadClient.once('connect', resolve);
      threadClient.once('connect_error', reject);
    });
    await subscribeRooms(threadClient, [`thread:${thread.id}`]);

    const runClient = createClient(`http://127.0.0.1:${port}`, { path: '/socket.io', transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      runClient.once('connect', resolve);
      runClient.once('connect_error', reject);
    });
    await subscribeRooms(runClient, [`run:${runId}`]);

    const toolExecution = await runEvents.startToolExecution({
      runId,
      threadId: thread.id,
      toolName: 'search',
      toolCallId: 'call-1',
      input: { query: 'status' },
    });

    const appendThreadLegacy = waitForEvent<{ mutation: string; event: { id: string } }>(threadClient, 'run_event_appended');
    const appendThreadCreated = waitForEvent<{ mutation: string; event: { id: string } }>(threadClient, 'run_timeline_event_created');
    const appendRunLegacy = waitForEvent<{ mutation: string; event: { id: string } }>(runClient, 'run_event_appended');
    const appendRunCreated = waitForEvent<{ mutation: string; event: { id: string } }>(runClient, 'run_timeline_event_created');
    const appendPayload = await runEvents.publishEvent(toolExecution.id, 'append');
    expect(appendPayload?.toolExecution?.input).toEqual({ query: 'status' });
    const [appendThreadLegacyPayload, appendRunLegacyPayload, appendThreadCreatedPayload, appendRunCreatedPayload] = await Promise.all([
      appendThreadLegacy,
      appendRunLegacy,
      appendThreadCreated,
      appendRunCreated,
    ]);
    expect(appendThreadLegacyPayload.mutation).toBe('append');
    expect(appendRunLegacyPayload.event.id).toBe(toolExecution.id);
    expect(appendThreadCreatedPayload.mutation).toBe('append');
    expect(appendThreadCreatedPayload.event.id).toBe(toolExecution.id);
    expect(appendRunCreatedPayload.event.id).toBe(toolExecution.id);

    await runEvents.completeToolExecution({
      eventId: toolExecution.id,
      status: ToolExecStatus.success,
      output: { answer: 42 },
      raw: { latencyMs: 1200 },
    });

    const updateThreadLegacy = waitForEvent<{ mutation: string; event: { toolExecution?: { output?: unknown } } }>(threadClient, 'run_event_appended');
    const updateThreadUpdated = waitForEvent<{ mutation: string; event: { toolExecution?: { output?: unknown } } }>(threadClient, 'run_timeline_event_updated');
    const updateRunLegacy = waitForEvent<{ mutation: string; event: { toolExecution?: { output?: unknown } } }>(runClient, 'run_event_appended');
    const updateRunUpdated = waitForEvent<{ mutation: string; event: { toolExecution?: { output?: unknown } } }>(runClient, 'run_timeline_event_updated');
    await runEvents.publishEvent(toolExecution.id, 'update');
    const [updateThreadLegacyPayload, updateThreadUpdatedPayload, updateRunLegacyPayload, updateRunUpdatedPayload] = await Promise.all([
      updateThreadLegacy,
      updateThreadUpdated,
      updateRunLegacy,
      updateRunUpdated,
    ]);
    expect(updateThreadLegacyPayload.mutation).toBe('update');
    expect(updateThreadUpdatedPayload.mutation).toBe('update');
    expect(updateRunLegacyPayload.event.toolExecution?.output).toEqual({ answer: 42 });
    expect(updateRunUpdatedPayload.event.toolExecution?.output).toEqual({ answer: 42 });

    await new Promise((resolve) => setTimeout(resolve, 150));

    await prisma.thread.delete({ where: { id: thread.id } });

    await Promise.all([closeClient(runClient), closeClient(threadClient)]);
    (gateway as unknown as { io?: { close(): void } }).io?.close();
    await closeServer(server);
  });
});
