import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/services/logger.service';
import { ContainerService } from '../src/services/container.service';
import { ConfigService } from '../src/services/config.service';
import { SlackService } from '../src/services/slack.service';
import { CheckpointerService } from '../src/services/checkpointer.service';

function mockDeps() {
  const logger = new LoggerService();
  const containerService = new ContainerService(logger);
  const configService = new ConfigService({
    githubAppId: '1',
    githubAppPrivateKey: 'k',
    githubInstallationId: 'i',
    openaiApiKey: 'x',
    githubToken: 't',
    slackBotToken: 's',
    slackAppToken: 'sa',
    mongodbUrl: 'm',
  });
  const slackService = new SlackService(configService, logger);
  const checkpointerService = new CheckpointerService(logger as any);
  return { logger, containerService, configService, slackService, checkpointerService } as const;
}

describe('templates: memoryNode registration', () => {
  it('includes memoryNode with $self source port and no target ports', () => {
    const deps = mockDeps();
    const registry = buildTemplateRegistry(deps);
    const schema = registry.toSchema();
    const mem = schema.find((s) => s.name === 'memoryNode');
    expect(mem).toBeDefined();
    expect(mem?.sourcePorts).toContain('$self');
    expect(mem?.targetPorts?.length || 0).toBe(0);
  });
});
