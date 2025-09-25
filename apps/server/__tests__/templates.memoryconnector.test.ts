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

describe('templates: memoryConnector registration', () => {
  it('includes memoryConnector with $self source port and memory target port', () => {
    const deps = mockDeps();
    const registry = buildTemplateRegistry(deps);
    const schema = registry.toSchema();
    const mc = schema.find((s) => s.name === 'memoryConnector');
    expect(mc).toBeDefined();
    expect(mc?.sourcePorts).toContain('$self');
    expect(mc?.targetPorts).toContain('memory');
  });
});
