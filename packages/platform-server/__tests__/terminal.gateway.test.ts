import { PassThrough } from 'node:stream';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { ContainerTerminalGateway } from '../src/infra/container/terminal.gateway';
import type { TerminalSessionsService, TerminalSessionRecord } from '../src/infra/container/terminal.sessions.service';
import type { ContainerService } from '../src/infra/container/container.service';
import { LoggerService } from '../src/core/services/logger.service';
import { waitFor, waitForWsClose } from './helpers/ws';

const logger = new LoggerService();

const createSessionRecord = (overrides: Partial<TerminalSessionRecord> = {}): TerminalSessionRecord => {
  const now = Date.now();
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    token: 'tok',
    containerId: 'cid',
    shell: '/bin/sh',
    cols: 80,
    rows: 24,
    createdAt: now,
    lastActivityAt: now,
    idleTimeoutMs: 60_000,
    maxDurationMs: 120_000,
    state: 'pending',
    ...overrides,
  };
};

describe('ContainerTerminalGateway (fastify websocket)', () => {
  it('logs SocketStream shape for diagnostics', async () => {
    const app = Fastify();
    await app.register(websocketPlugin);

    let resolveConnection!: (value: unknown) => void;
    const connectionCaptured = new Promise((resolve) => {
      resolveConnection = resolve;
    });

    app.get('/shape', { websocket: true }, (connection) => {
      // Intended console diagnostics to document runtime shape under NODE_ENV=test
      console.log('fastify-socketstream-typeof', typeof connection);
      console.log('fastify-socketstream-keys', Object.keys(connection));
      console.log('fastify-socketstream-props', Object.getOwnPropertyNames(connection));
      const socket = (connection as { socket?: WebSocket }).socket;
      console.log('fastify-socket-typeof', typeof socket);
      if (socket) {
        console.log('fastify-socket-keys', Object.keys(socket));
        console.log('fastify-socket-props', Object.getOwnPropertyNames(socket));
      }
      resolveConnection(connection);
      socket?.close();
    });

    await app.ready();

    const ws = await app.injectWS('/shape');
    ws.close();
    await connectionCaptured;
    await app.close();
  });

  it('closes connection when container id is missing', async () => {
    const record = createSessionRecord();
    const sessionMocks = {
      validate: vi.fn(),
      markConnected: vi.fn(),
      get: vi.fn(),
      touch: vi.fn(),
      close: vi.fn(),
    };
    const containerMocks = {
      openInteractiveExec: vi.fn(),
      resizeExec: vi.fn(),
    };

    const gateway = new ContainerTerminalGateway(
      sessionMocks as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
      logger,
    );

    const originalHandle = (gateway as unknown as { handleConnection: (c: unknown, r: FastifyRequest) => Promise<void> })
      .handleConnection.bind(gateway);
    (gateway as unknown as { handleConnection: (c: unknown, r: FastifyRequest) => Promise<void> }).handleConnection = async (
      connection,
      request,
    ) => {
      (request as FastifyRequest & { params: Record<string, string | undefined> }).params = { containerId: '' };
      return originalHandle(connection, request);
    };

    const app = Fastify();
    gateway.registerRoutes(app);
    await app.ready();

    const messages: unknown[] = [];
    const handleMessage = (payload: WebSocket.RawData) => {
      const text = typeof payload === 'string' ? payload : payload.toString('utf8');
      try {
        messages.push(JSON.parse(text));
      } catch {
        messages.push(text);
      }
    };
    const ws = await app.injectWS(
      `/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
      {},
      {
        onInit(client) {
          client.on('message', handleMessage);
        },
      },
    );
    await waitFor(() => messages.length > 0, 1000).catch(() => undefined);
    const closeInfo = await waitForWsClose(ws, 1000);

    expect(closeInfo.code).toBe(1008);
    expect(closeInfo.reason).toBe('container_id_required');
    const errorMessage = messages.find((msg) => typeof msg === 'object' && msg !== null);
    if (errorMessage) {
      expect(errorMessage).toMatchObject({ code: 'container_id_required' });
    }
    expect(sessionMocks.validate).not.toHaveBeenCalled();

    await app.close();
  });

  it('handles terminal websocket session end-to-end', async () => {
    const record = createSessionRecord({ shell: '/bin/bash', cols: 120, rows: 32, maxDurationMs: 300_000 });
    const sessionMocks = {
      validate: vi.fn().mockReturnValue(record),
      markConnected: vi.fn().mockImplementation(() => {
        record.state = 'connected';
      }),
      get: vi.fn().mockImplementation(() => record),
      touch: vi.fn().mockImplementation(() => {
        record.lastActivityAt = Date.now();
      }),
      close: vi.fn(),
    };

    let stdinBuffer = '';
    const stdin = new PassThrough();
    stdin.on('data', (chunk) => {
      stdinBuffer += chunk.toString();
    });
    const stdout = new PassThrough();
    const closeExec = vi.fn().mockResolvedValue({ exitCode: 0 });

    const containerMocks = {
      openInteractiveExec: vi.fn().mockResolvedValue({
        stdin,
        stdout,
        stderr: undefined,
        close: closeExec,
        execId: 'exec-123',
      }),
      resizeExec: vi.fn().mockResolvedValue(undefined),
    };

    const gateway = new ContainerTerminalGateway(
      sessionMocks as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
      logger,
    );

    const app = Fastify();
    gateway.registerRoutes(app);
    await app.ready();

    const messages: { type?: string; [key: string]: unknown }[] = [];
    const handleMessage = (payload: WebSocket.RawData) => {
      const text = typeof payload === 'string' ? payload : payload.toString('utf8');
      try {
        messages.push(JSON.parse(text) as { type?: string });
      } catch {
        // ignore non-json frames
      }
    };

    const ws = await app.injectWS(
      `/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
      {},
      {
        onInit(client) {
          client.on('message', handleMessage);
        },
      },
    );

    await waitFor(() => messages.some((msg) => msg.type === 'status' && msg.phase === 'running'), 3000);

    ws.send(JSON.stringify({ type: 'input', data: 'echo hi\r\n' }));
    await waitFor(() => stdinBuffer.length > 0);
    expect(stdinBuffer).toBe('echo hi\r');

    stdout.write('hello-from-container');
    await waitFor(() => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string'), 3000);
    const outputPayload = messages.find((msg) => msg.type === 'output');
    expect(outputPayload?.data).toContain('hello-from-container');

    ws.send(JSON.stringify({ type: 'close' }));
    const closeInfo = await waitForWsClose(ws, 2000);

    expect(closeInfo.code).toBe(1000);
    expect(closeExec).toHaveBeenCalled();
    expect(sessionMocks.close).toHaveBeenCalledWith(record.sessionId);

    await app.close();
  });

  it('falls back to terminate when close is unavailable', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const sessionMocks = {
      validate: vi.fn(),
      markConnected: vi.fn(),
      get: vi.fn(),
      touch: vi.fn(),
      close: vi.fn(),
    };
    const containerMocks = {
      openInteractiveExec: vi.fn(),
      resizeExec: vi.fn(),
    };

    const gateway = new ContainerTerminalGateway(
      sessionMocks as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
      logger,
    );

    const originalHandle = (gateway as unknown as { handleConnection: (c: unknown, r: FastifyRequest) => Promise<void> })
      .handleConnection.bind(gateway);
    let terminateSpy: ReturnType<typeof vi.fn> | undefined;

    (gateway as unknown as { handleConnection: (c: unknown, r: FastifyRequest) => Promise<void> }).handleConnection = async (
      connection,
      request,
    ) => {
      const socket = ((connection as { socket?: WebSocket }).socket ?? connection) as WebSocket;
      let restoreClose: (() => void) | null = null;
      if (socket && typeof socket === 'object') {
        terminateSpy = vi.fn();
        const originalClose = socket.close;
        (socket as { terminate: () => void }).terminate = terminateSpy;
        (socket as { close: () => void }).close = () => {
          throw new Error('close not available');
        };
        restoreClose = () => {
          if (originalClose) {
            socket.close = originalClose;
          } else {
            delete (socket as { close?: () => void }).close;
          }
        };
      }
      (request as FastifyRequest & { params: Record<string, string | undefined> }).params = { containerId: '' };
      try {
        return await originalHandle(connection, request);
      } finally {
        restoreClose?.();
      }
    };

    const app = Fastify();
    gateway.registerRoutes(app);
    await app.ready();

    const ws = await app.injectWS(`/api/containers/cid/terminal/ws?sessionId=${sessionId}&token=tok`);
    await waitForWsClose(ws, 1000);

    expect(terminateSpy).toBeDefined();
    expect(terminateSpy?.mock.calls.length ?? 0).toBeGreaterThan(0);

    await app.close();
  });
});
