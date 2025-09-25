import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../templates';
import { LoggerService } from '../services/logger.service';
import { ContainerService } from '../services/container.service';
import { ConfigService } from '../services/config.service';
import { SlackService } from '../services/slack.service';
import { CheckpointerService } from '../services/checkpointer.service';

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

describe('templates: memory tools registration', () => {
  it('includes all memory tools with $self and memory target ports', () => {
    const deps = mockDeps();
    const registry = buildTemplateRegistry(deps);
    const schema = registry.toSchema();
    const names = [
      'memory_read',
      'memory_list',
      'memory_append',
      'memory_update',
      'memory_delete',
    ];
    for (const n of names) {
      const ent = schema.find((s) => s.name === n);
      expect(ent).toBeDefined();
      expect(ent?.targetPorts).toContain('$self');
      expect(ent?.targetPorts).toContain('memory');
    }
  });
});
