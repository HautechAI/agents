import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerService } from '../../src/core/services/logger.service';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { ContainerService } from '../../src/infra/container/container.service';
import { isExecTimeoutError, ExecIdleTimeoutError } from '../../src/utils/execTimeout';
// ContainerProviderEntity was removed in refactor; use WorkspaceNode where needed or stub.
import { ContainerHandle } from '../../src/infra/container/container.handle';
import type { Mock } from 'vitest';

describe('ShellTool timeout error message', () => {
  it('throws clear timeout error with tail header on exec timeout', async () => {
    const logger = new LoggerService();
    const timeoutErr = new Error('Exec timed out after 3600000ms');

    const fakeContainer = {
      exec: vi.fn(async () => {
        throw timeoutErr;
      }),
    } as const;

    const FakeContainer = class { async exec(): Promise<never> { throw timeoutErr; } } as any;
    const node = new ShellCommandNode(new (await import('../../src/graph/env.service')).EnvService(new LoggerService() as any));
    node.setContainerProvider(({
      provide: async (_t: string) => ({ exec: async () => { throw timeoutErr; } } as any),
    } as any));
    await node.setConfig({});
    const t = node.getTool();

    const payload: any = { command: 'sleep 999999' };
    const ctx: any = { threadId: 't' };
    await expect(
      t.execute(payload, ctx),
    ).rejects.toThrowError(/Error \(timeout after 3600000ms\): command exceeded 3600000ms and was terminated\. See output tail below\./);
    await expect(
      t.execute(payload, ctx),
    ).rejects.toThrowError(/----------/);
  });

  it('distinguishes idle timeout messaging', async () => {
    const logger = new LoggerService();
    const idleErr = new ExecIdleTimeoutError(60000, 'out', 'err');
    const fakeContainer = { exec: vi.fn(async () => { throw idleErr; }) } as const;
    const FakeContainer = class { async exec(): Promise<never> { throw idleErr; } } as any;
    const node = new ShellCommandNode(new (await import('../../src/graph/env.service')).EnvService(new LoggerService() as any));
    node.setContainerProvider(({
      provide: async (_t: string) => ({ exec: async () => { throw idleErr; } } as any),
    } as any));
    await node.setConfig({});
    const t = node.getTool();
    const payload: any = { command: 'sleep 999999' };
    const ctx: any = { threadId: 't' };
    await expect(
      t.execute(payload, ctx),
    ).rejects.toThrowError(/Error \(idle timeout\): no output for 60000ms; command was terminated\./);
  });

  it('reports actual enforced idle timeout from error.timeoutMs when available', async () => {
    const logger = new LoggerService();
    const idleErr = new (class extends ExecIdleTimeoutError { constructor() { super(12345, 'out', 'err'); } })();
    const fakeContainer = { exec: vi.fn(async () => { throw idleErr; }) } as const;
    const FakeContainer = class { async exec(): Promise<never> { throw idleErr; } } as any;
    const node = new ShellCommandNode(new (await import('../../src/graph/env.service')).EnvService(new LoggerService() as any));
    node.setContainerProvider(({
      provide: async (_t: string) => ({ exec: async () => { throw idleErr; } } as any),
    } as any));
    await node.setConfig({ idleTimeoutMs: 60000 });
    const t = node.getTool();
    const payload: any = { command: 'sleep 999999' };
    const ctx: any = { threadId: 't' };
    await expect(
      t.execute(payload, ctx),
    ).rejects.toThrowError(/no output for 12345ms/);
  });
});

describe('ContainerService.execContainer killOnTimeout behavior', () => {
  let svc: ContainerService;
  let logger: LoggerService;
  beforeEach(() => {
    logger = new LoggerService();
    svc = new ContainerService(logger);
  });

  it('stops container on timeout when killOnTimeout=true', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;

    // Patch service docker instance without any: use Reflect.set
    Reflect.set(svc as unknown as object, 'docker', docker);
    // Simulate timeout by throwing during exec.inspect() at end
    // We'll patch exec.inspect via docker mock below
    const timeoutErr = new Error('Exec timed out after 123ms');
    const getContainer = docker.getContainer;
    // Patch startAndCollectExec behavior by providing a container.exec that yields a stream that errors
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw timeoutErr; }));

    await expect(
      svc.execContainer('cid123', 'echo hi', { timeoutMs: 123, killOnTimeout: true }),
    ).rejects.toThrow(/timed out/);
    // Ensure stop was called via stopContainer path (second getContainer call)
    expect(docker.getContainer).toHaveBeenCalledTimes(2);
    const stopped = docker.getContainer.mock.results[1].value;
    expect(stopped.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop container when killOnTimeout is false/omitted', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const timeoutErr = new Error('Exec timed out after 456ms');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw timeoutErr; }));

    await expect(
      svc.execContainer('cid999', 'echo nope', { timeoutMs: 456 }),
    ).rejects.toThrow(/timed out/);
    // Ensure stop was not called on any container instance
    const getContainerMock = docker.getContainer;
    const anyStopped = getContainerMock.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(anyStopped).toBe(false);
    // Optional: verify only one getContainer call (inspect only)
    expect(docker.getContainer).toHaveBeenCalledTimes(1);
  });

  it('propagates non-timeout errors unchanged (service)', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const genericErr = new Error('Some other failure');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw genericErr; }));

    await expect(svc.execContainer('cid42', 'echo oops', { timeoutMs: 50, killOnTimeout: true })).rejects.toBe(
      genericErr,
    );
    // Should not attempt stop as it is not a timeout
    const anyStopped = docker.getContainer.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(anyStopped).toBe(false);
  });

  it('stops container on idle timeout with killOnTimeout=true', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const idleErr = new ExecIdleTimeoutError(321, 'a', 'b');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw idleErr; }));

    await expect(
      svc.execContainer('cidIdle', 'echo idle', { timeoutMs: 9999, idleTimeoutMs: 321, killOnTimeout: true }),
    ).rejects.toBe(idleErr);
    expect(docker.getContainer).toHaveBeenCalledTimes(2);
    const stopped = docker.getContainer.mock.results[1].value;
    expect(stopped.stop).toHaveBeenCalledTimes(1);
  });
});

describe('ShellTool non-timeout error propagation', () => {
  it('rethrows non-timeout errors', async () => {
    const logger = new LoggerService();
    class FakeContainer extends ContainerEntity {
      override async exec(): Promise<never> { throw new Error('Permission denied'); }
    }
    const node = new ShellCommandNode(new (await import('../../src/graph/env.service')).EnvService(new LoggerService() as any));
    node.setContainerProvider(({
      provide: async (_t: string) => ({ exec: async () => { throw new Error('Permission denied'); } } as any),
    } as any));
    await node.setConfig({});
    const t = node.getTool();
    const payload: any = { command: 'ls' };
    const ctx: any = { threadId: 't' };
    await expect(
      t.execute(payload, ctx),
    ).rejects.toThrow('Permission denied');
  });
});
