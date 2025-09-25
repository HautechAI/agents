import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../templates';
import { LoggerService } from '../services/logger.service';
import { ContainerService } from '../services/container.service';
import { ConfigService } from '../services/config.service';
import { SlackService } from '../services/slack.service';
import { CheckpointerService } from '../services/checkpointer.service';

const logger = new LoggerService();

const mockDeps = {
  logger,
  containerService: new ContainerService(logger),
  configService: new ConfigService(),
  slackService: new SlackService(logger),
  checkpointerService: new CheckpointerService(logger),
};

describe('templates - simpleAgent memory port', () => {
  it('includes memory target port', () => {
    const reg = buildTemplateRegistry(mockDeps);
    const schema = reg.toSchema();
    const simple = schema['simpleAgent'];
    expect(simple).toBeTruthy();
    expect(simple.targetPorts?.memory).toBeTruthy();
    expect(simple.targetPorts?.memory.kind).toBe('method');
    expect(simple.targetPorts?.memory.create).toBe('setMemoryConnector');
  });
});
