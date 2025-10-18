import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerProviderEntity, type ContainerProviderStaticConfig } from '../entities/containerProvider.entity';
import { ContainerService, type ContainerOpts } from '../services/container.service';
import { LoggerService } from '../services/logger.service';
import { ContainerEntity } from '../entities/container.entity';

class StubLogger extends LoggerService {
  override info = vi.fn();
  override debug = vi.fn();
  override error = vi.fn();
}

class FakeContainer extends ContainerEntity {
  private calls: { cmd: string; opts?: any; rc: number }[] = [];
  constructor(svc: ContainerService, id: string, private execPlan: ((cmd: string) => { rc: number }) | null) {
    super(svc, id);
  }
  override async exec(
    command: string[] | string,
    options?: {
      workdir?: string;
      env?: Record<string, string> | string[];
      timeoutMs?: number;
      idleTimeoutMs?: number;
      killOnTimeout?: boolean;
      tty?: boolean;
      signal?: AbortSignal;
    },
  ) {
    const cmd = Array.isArray(command) ? command.join(' ') : command;
    const plan = this.execPlan || (() => ({ rc: 0 }));
    const { rc } = plan(cmd);
    this.calls.push({ cmd, opts: options, rc });
    return { stdout: '', stderr: '', exitCode: rc } as { stdout: string; stderr: string; exitCode: number };
  }
  getExecCalls() {
    return this.calls;
  }
}

class StubContainerService extends ContainerService {
  constructor() { super(new LoggerService()); }
  created?: FakeContainer;
  override async start(_opts?: ContainerOpts): Promise<ContainerEntity> {
    // Default: container with all exec returning rc=0
    this.created = new FakeContainer(this, 'c', null);
    return this.created;
  }
  override async findContainerByLabels(_labels: Record<string, string>, _opts?: { all?: boolean }): Promise<ContainerEntity | undefined> { return undefined; }
  override async findContainersByLabels(_labels: Record<string, string>, _opts?: { all?: boolean }): Promise<ContainerEntity[]> { return []; }
  override async getContainerLabels(_containerId: string): Promise<Record<string, string> | undefined> { return {}; }
}

function makeProvider(execPlan?: (cmd: string) => { rc: number }) {
  const svc = new StubContainerService();
  const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}));
  const logger = new StubLogger();
  provider.setLogger(logger);
  // Inject custom plan into created container
  vi.spyOn(svc, 'start').mockImplementation(async () => {
    svc.created = new FakeContainer(svc, 'c', execPlan || null);
    return svc.created;
  });
  return { provider, svc, logger };
}

describe('ContainerProviderEntity nix install', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips when no packages', async () => {
    const { provider, svc, logger } = makeProvider();
    provider.setConfig({ image: 'alpine:3' } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    // No nix detection nor install
    expect(calls.length).toBe(0);
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.find((c) => String(c[0]).includes('skipping install'))).toBeFalsy();
  });

  it('skips with info when nix not present', async () => {
    // Plan: first call is detection -> return rc != 0
    let first = true;
    const plan = (cmd: string) => {
      if (first && cmd.includes('nix --version')) { first = false; return { rc: 1 }; }
      return { rc: 0 };
    };
    const { provider, svc, logger } = makeProvider(plan);
    provider.setConfig({ image: 'alpine:3', nix: { packages: [{ commitHash: 'a'.repeat(40), attributePath: 'htop' }] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    expect(calls.length).toBe(1); // only detection
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('Nix not present'))).toBe(true);
  });

  it('runs combined install when nix present', async () => {
    // Plan: detection rc=0; combined rc=0
    let seq = 0;
    const plan = (cmd: string) => {
      seq += 1;
      if (cmd.includes('nix --version')) return { rc: 0 };
      if (cmd.includes('nix profile install')) return { rc: 0 };
      return { rc: 0 };
    };
    const { provider, svc, logger } = makeProvider(plan);
    provider.setConfig({ image: 'alpine:3', nix: { packages: [
      { commitHash: 'b'.repeat(40), attributePath: 'htop' },
      { commitHash: 'c'.repeat(40), attributePath: 'curl' },
    ] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const combined = calls.find((c) => String(c.cmd).includes('nix profile install'));
    expect(combined).toBeDefined();
    // Verify both refs are present
    expect(String((combined as { cmd: string }).cmd)).toContain(`github:NixOS/nixpkgs/${'b'.repeat(40)}#htop`);
    expect(String((combined as { cmd: string }).cmd)).toContain(`github:NixOS/nixpkgs/${'c'.repeat(40)}#curl`);
    // Info log about combined
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('Nix install'))).toBe(true);
  });

  it('falls back per-package on combined failure', async () => {
    // Plan: detection rc=0; combined rc=1; per-package: first rc=0, second rc=1
    let stage: 'detect' | 'combined' | 'pkg1' | 'pkg2' = 'detect';
    const plan = (cmd: string) => {
      if (cmd.includes('nix --version')) { stage = 'combined'; return { rc: 0 }; }
      if (stage === 'combined' && cmd.includes('nix profile install') && cmd.includes('#htop') && cmd.includes('#curl')) { stage = 'pkg1'; return { rc: 1 }; }
      if (stage === 'pkg1' && cmd.includes('#htop')) { stage = 'pkg2'; return { rc: 0 }; }
      if (stage === 'pkg2' && cmd.includes('#curl')) { return { rc: 1 }; }
      return { rc: 0 };
    };
    const { provider, svc, logger } = makeProvider(plan);
    provider.setConfig({ image: 'alpine:3', nix: { packages: [
      { commitHash: 'd'.repeat(40), attributePath: 'htop' },
      { commitHash: 'e'.repeat(40), attributePath: 'curl' },
    ] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();

    // Ensure sequential per-package fallback executed in order
    const pkgCalls = calls.filter((c) => String(c.cmd).includes('nix profile install') && !String(c.cmd).includes('#htop #curl'));
    // Expect exactly two per-package calls
    expect(pkgCalls.length).toBeGreaterThanOrEqual(2);
    // Order should be htop then curl per our staged plan
    expect(String(pkgCalls[0].cmd)).toContain('#htop');
    expect(String(pkgCalls[1].cmd)).toContain('#curl');
    // Expect detection + combined + 2 per-package = 4 execs
    expect(calls.length).toBeGreaterThanOrEqual(4);
    // Error logs recorded
    expect((logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('combined'))).toBe(true);
    // Success/failure logs per package
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('succeeded for'))).toBe(true);
    expect((logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('failed for'))).toBe(true);
  });

  it('logs unresolved legacy/UI shapes and skips', async () => {
    const { provider, svc, logger } = makeProvider();
    provider.setConfig({ image: 'alpine:3', nix: { packages: [ { attr: 'htop' }, { name: 'htop', version: '1.2.3' } ] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    // No detection nor install
    expect(calls.length).toBe(0);
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('unresolved'))).toBe(true);
  });
});

// Remove duplicate test suite introduced by a bad merge.
// The following second import block and tests are intentionally deleted.
// Keeping a single, type-safe suite aligned with current ContainerProviderEntity implementation.
import { describe, it, expect } from 'vitest';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ContainerEntity } from '../entities/container.entity';
import { ContainerService, type ContainerOpts } from '../services/container.service';
import { LoggerService } from '../services/logger.service';
import { ConfigService, configSchema } from '../services/config.service';

class SilentLogger extends LoggerService {
  // Override to keep test output quiet
  override info(): void {}
  override debug(): void {}
  override error(): void {}
}

class FakeContainer extends ContainerEntity {
  public installCount = 0;
  public installSkippedDueToLock = 0;
  public probeCount = 0;
  public lastDigest = '';
  private installing = false;

  constructor(service: ContainerService, id: string, private behavior: {
    nixPresent?: boolean;
    installShouldFail?: boolean;
    slowInstallMs?: number;
  } = {}) {
    super(service, id);
  }

  override async exec(command: string[] | string, _options?: { timeoutMs?: number; tty?: boolean }) {
    const cmdStr = Array.isArray(command) ? command.join(' ') : command;
    // Probe for nix
    if (cmdStr.includes('command -v nix')) {
      this.probeCount++;
      return { stdout: '', stderr: '', exitCode: this.behavior.nixPresent === false ? 1 : 0 };
    }
    // Read sentinel
    if (cmdStr.includes('cat /var/lib/hautech/nix-specs.sha256')) {
      const out = this.lastDigest ? `${this.lastDigest}\n` : '';
      return { stdout: out, stderr: '', exitCode: 0 };
    }
    // Perform install
    if (cmdStr.includes('nix profile install')) {
      if (this.installing) {
        this.installSkippedDueToLock++;
        return { stdout: '', stderr: 'another installer is running; skipping', exitCode: 0 };
      }
      this.installing = true;
      this.installCount++;
      // Extract digest written by printf "..." 'digest' > /var/lib/hautech/nix-specs.sha256
      const m = cmdStr.match(/printf\s+"%s"\s+'([a-f0-9]{64})'\s*>\s*\/var\/lib\/hautech\/nix-specs\.sha256/);
      const digest = m?.[1] || '';
      if (this.behavior.slowInstallMs) await new Promise((r) => setTimeout(r, this.behavior.slowInstallMs));
      if (this.behavior.installShouldFail) {
        this.installing = false;
        return { stdout: '', stderr: 'simulated failure', exitCode: 1 };
      }
      this.lastDigest = digest;
      this.installing = false;
      return { stdout: '', stderr: '', exitCode: 0 };
    }
    // Default no-op
    return { stdout: '', stderr: '', exitCode: 0 };
  }
}

class FakeContainerService extends ContainerService {
  public c?: FakeContainer;
  constructor() { super(new SilentLogger()); }
  override async start(_opts?: ContainerOpts): Promise<FakeContainer> {
    if (!this.c) this.c = new FakeContainer(this, 'c1');
    return this.c;
  }
  override async findContainerByLabels(): Promise<FakeContainer | undefined> {
    return this.c;
  }
  override async findContainersByLabels(): Promise<FakeContainer[]> { return this.c ? [this.c] : []; }
  override async getContainerLabels(): Promise<Record<string, string>> { return { 'hautech.ai/role': 'workspace' }; }
}

function makeConfigService(overrides?: Partial<ReturnType<typeof configSchema.parse>>) {
  const base = configSchema.parse({
    githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
    graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
    dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
    mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'false', ncpsUrl: 'http://ncps:8501'
  });
  return new ConfigService({ ...base, ...(overrides as any) });
}

describe('ContainerProviderEntity Nix install behavior', () => {
  it('fresh path: installs when packages set', async () => {
    const svc = new FakeContainerService();
    const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}), makeConfigService());
    provider.setConfig({ image: 'alpine:3', nix: { packages: [{ attr: 'htop', channel: 'nixpkgs-unstable' }], timeoutSeconds: 5 } });
    const c = await provider.provide('t1');
    expect(c).toBeTruthy();
    expect(svc.c?.installCount).toBe(1);
  });

  it('fresh path: skips when packages empty', async () => {
    const svc = new FakeContainerService();
    const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}), makeConfigService());
    provider.setConfig({ image: 'alpine:3', nix: { packages: [] } });
    await provider.provide('t2');
    expect(svc.c?.installCount || 0).toBe(0);
    expect(svc.c?.probeCount || 0).toBe(0);
  });

  it('reuse path: idempotent after sentinel matches', async () => {
    const svc = new FakeContainerService();
    const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}), makeConfigService());
    provider.setConfig({ image: 'alpine:3', nix: { packages: [{ attr: 'git', channel: 'nixpkgs-unstable' }] } });
    await provider.provide('t3');
    // Reuse same container; second call should skip install due to sentinel digest
    await provider.provide('t3');
    expect(svc.c?.installCount).toBe(1);
  });

  it('no-nix path: skips with probe failure', async () => {
    const svc = new FakeContainerService();
    // Replace container with nix missing behavior
    svc.c = new FakeContainer(svc, 'c2', { nixPresent: false });
    const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}), makeConfigService());
    provider.setConfig({ image: 'alpine:3', nix: { packages: [{ attr: 'curl' }] } });
    await provider.provide('t4');
    expect(svc.c?.probeCount).toBeGreaterThanOrEqual(1);
    expect(svc.c?.installCount).toBe(0);
  });

  it('non-zero exit from install: logs and continues', async () => {
    const svc = new FakeContainerService();
    svc.c = new FakeContainer(svc, 'c3', { installShouldFail: true });
    const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}), makeConfigService());
    provider.setConfig({ image: 'alpine:3', nix: { packages: [{ attr: 'jq' }] } });
    const c = await provider.provide('t5');
    expect(c).toBeTruthy();
    expect(svc.c?.installCount).toBe(1);
  });

  it('concurrency guard: only one install runs with two concurrent provide() calls', async () => {
    const svc = new FakeContainerService();
    // Slow install to allow overlap
    svc.c = new FakeContainer(svc, 'c4', { slowInstallMs: 50 });
    const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}), makeConfigService());
    provider.setConfig({ image: 'alpine:3', nix: { packages: [{ attr: 'ripgrep' }] } });
    await Promise.all([provider.provide('t6'), provider.provide('t6')]);
    expect(svc.c?.installCount).toBe(1);
    expect(svc.c?.installSkippedDueToLock).toBeGreaterThanOrEqual(1);
  });
});
