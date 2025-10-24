import { describe, it, expect, vi } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { LoggerService } from '../../src/core/services/logger.service';
import { ExecTimeoutError } from '../../src/utils/execTimeout';
import { ContainerEntity } from '../../src/entities/container.entity';
import { ContainerProviderEntity } from '../../src/entities/containerProvider.entity';
import { ContainerService } from '../../src/infra/container/container.service';

// ANSI sequences should be stripped, but otherwise content preserved when <=10k
const ANSI_GREEN = '\u001b[32m';
const ANSI_RESET = '\u001b[0m';

describe('ShellTool timeout full inclusion when <=10k', () => {
  it('includes full stripped output when combined <= 10k chars', async () => {
    const logger = new LoggerService();
    const smallStdout = `${ANSI_GREEN}hello-from-stdout${ANSI_RESET}`;
    const smallStderr = `${ANSI_GREEN}and-stderr${ANSI_RESET}`;
    const combinedPlain = 'hello-from-stdoutand-stderr';
    const err = new ExecTimeoutError(3600000, smallStdout, smallStderr);

    class FakeContainer extends ContainerEntity { override async exec(): Promise<never> { throw err; } }
    class FakeProvider extends ContainerProviderEntity {
      constructor(logger: LoggerService) { super(new ContainerService(logger), undefined, {}, () => ({})); }
      override async provide(): Promise<ContainerEntity> { return new FakeContainer(new ContainerService(logger), 'fake'); }
    }
    const provider = new FakeProvider(logger);
    const node = new ShellCommandNode(undefined as any);
    node.setContainerProvider(provider as any);
    await node.setConfig({});
    const t = node.getTool();

    const payload = { command: 'sleep 1h' } as any;
    try {
      await t.execute(payload as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any);
      throw new Error('expected to throw');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const sepIndex = msg.indexOf('----------');
      expect(sepIndex).toBeGreaterThan(0);
      const tail = msg.slice(sepIndex + '----------'.length + 1); // skip separator and newline
      // no ansi
      expect(tail).not.toMatch(/\u001b\[/);
      // full plain text content should be present (not truncated)
      expect(tail).toContain(combinedPlain);
    }
  });
});
