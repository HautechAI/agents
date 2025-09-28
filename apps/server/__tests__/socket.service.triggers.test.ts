import { describe, expect, it, vi } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { io as Client } from 'socket.io-client';
import { LoggerService } from '../src/services/logger.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import { SocketService } from '../src/services/socket.service';
import { TriggerEventsService } from '../src/services/trigger-events.service';

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

describe('SocketService trigger events', () => {
  it('init/update/close flow with filtering', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer, { cors: { origin: '*' } });
    await new Promise<void>((r) => httpServer.listen(() => r()));
    const logger = new LoggerService();
    const checkpointer = new CheckpointerService(logger);
    // mock checkpointer watch to avoid Mongo
    // @ts-ignore
    checkpointer.fetchLatestWrites = vi.fn().mockResolvedValue([]);
    // @ts-ignore
    checkpointer.watchInserts = vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() });
    const triggerEvents = new TriggerEventsService(10);
    const svc = new SocketService(io as any, logger, checkpointer as any, triggerEvents);
    svc.register();

    const port = (httpServer.address() as any).port;
    const url = `http://localhost:${port}`;
    const client = Client(url, { autoConnect: true, transports: ['websocket'] });
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));

    const initial: any[] = [];
    client.on('trigger_initial', (p) => initial.push(p));
    const events: any[] = [];
    client.on('trigger_event', (p) => events.push(p));

    client.emit('trigger_init', { nodeId: 'n1' });
    await delay(10);
    // append two events
    // manually emit via service binding
    triggerEvents['append']?.('n1' as any, { ts: Date.now(), threadId: 'a', messages: [{ content: '1', info: {} }] } as any);
    triggerEvents['append']?.('n1' as any, { ts: Date.now(), threadId: 'b', messages: [{ content: '2', info: {} }] } as any);
    triggerEvents['emitter']?.emit('event', { nodeId: 'n1', event: { ts: Date.now(), threadId: 'a', messages: [{ content: '1', info: {} }] } });
    triggerEvents['emitter']?.emit('event', { nodeId: 'n1', event: { ts: Date.now(), threadId: 'b', messages: [{ content: '2', info: {} }] } });
    await delay(10);
    expect(events.length).toBe(2);

    // update filter to thread a
    client.emit('trigger_update', { nodeId: 'n1', threadId: 'a' });
    await delay(10);
    // initial should include only thread a
    expect(initial[initial.length - 1].items.every((it: any) => it.threadId === 'a')).toBe(true);

    // emit another b (should be ignored) and a (should be delivered)
    triggerEvents['emitter']?.emit('event', { nodeId: 'n1', event: { ts: Date.now(), threadId: 'b', messages: [{ content: 'x', info: {} }] } });
    triggerEvents['emitter']?.emit('event', { nodeId: 'n1', event: { ts: Date.now(), threadId: 'a', messages: [{ content: 'y', info: {} }] } });
    await delay(10);
    expect(events[events.length - 1].event.threadId).toBe('a');

    // close subscription
    client.emit('trigger_close', { nodeId: 'n1' });
    await delay(10);
    const prev = events.length;
    triggerEvents['emitter']?.emit('event', { nodeId: 'n1', event: { ts: Date.now(), threadId: 'a', messages: [{ content: 'z', info: {} }] } });
    await delay(10);
    expect(events.length).toBe(prev);

    client.close();
    await new Promise<void>((r) => io.close(() => r()))
    await new Promise<void>((r) => httpServer.close(() => r()))
  });
});
