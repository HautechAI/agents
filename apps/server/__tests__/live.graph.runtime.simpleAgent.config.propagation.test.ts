import { describe, it, expect } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { GraphDefinition } from '../src/graph/types';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/services/logger.service';
import { ContainerService } from '../src/services/container.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';

// Avoid any real network calls by ensuring ChatOpenAI token counting/invoke are not used in this test.
// We don't invoke the graph; we only verify propagation of config to internal nodes/fields.

describe('LiveGraphRuntime -> SimpleAgent config propagation', () => {
  function makeRuntime() {
    const logger = new LoggerService();
    const containerService = new ContainerService(logger);
    const configService = new ConfigService({
      githubAppId: 'test',
      githubAppPrivateKey: 'test',
      githubInstallationId: 'test',
      openaiApiKey: 'test',
      githubToken: 'test',
      mongodbUrl: 'mongodb://localhost:27017/?replicaSet=rs0',
    } as any);
    const checkpointerService = new CheckpointerService(logger);
    // Patch to bypass Mongo requirement for this lightweight test
    (checkpointerService as any).getCheckpointer = () => ({
      async getTuple() { return undefined; },
      async *list() {},
      async put(_config: any, _checkpoint: any, _metadata: any) { return { configurable: { thread_id: 't' } } as any; },
      async putWrites() {},
      getNextVersion() { return '1'; },
    });
    const mongoService = { getDb: () => ({} as any) } satisfies Pick<MongoService, 'getDb'>;
    const registry = buildTemplateRegistry({ logger, containerService, configService, checkpointerService, mongoService: mongoService as unknown as MongoService });
    const runtime = new LiveGraphRuntime(logger, registry);
    return { runtime };
  }

  it('applies provided config on configure/start and updates on re-apply', async () => {
    const { runtime } = makeRuntime();
    const systemPrompt = 'You are Strict.';
    const model = 'gpt-9-test';
    const keep = 123;
    const max = 456;
    const restrict = true;
    const restrictionMessage = 'Always call a tool first.';

    const graph1: GraphDefinition = {
      nodes: [
        {
          id: 'agent',
          data: {
            template: 'simpleAgent',
            config: {
              systemPrompt,
              model,
              summarizationKeepTokens: keep,
              summarizationMaxTokens: max,
              restrictOutput: restrict,
              restrictionMessage,
            },
          },
        },
      ],
      edges: [],
    };

    await runtime.apply(graph1);
    const agent: any = runtime.getNodeInstance('agent');

    // Validate propagation into internal nodes/fields
    expect((agent as any).callModelNode?.['systemPrompt']).toBe(systemPrompt);
    expect((agent as any).llm?.['model']).toBe(model);
    expect((agent as any).summarizeNode?.['keepTokens']).toBe(keep);
    expect((agent as any).summarizeNode?.['maxTokens']).toBe(max);
    expect((agent as any).restrictOutput).toBe(restrict);
    expect((agent as any).restrictionMessage).toBe(restrictionMessage);

    // Update config live and re-apply
    const newSystemPrompt = 'You are Even Stricter.';
    const newModel = 'gpt-9x-test';
    const graph2: GraphDefinition = {
      nodes: [
        {
          id: 'agent',
          data: {
            template: 'simpleAgent',
            config: {
              systemPrompt: newSystemPrompt,
              model: newModel,
              summarizationKeepTokens: keep,
              summarizationMaxTokens: max,
              restrictOutput: restrict,
              restrictionMessage,
            },
          },
        },
      ],
      edges: [],
    };

    await runtime.apply(graph2);
    const agent2: any = runtime.getNodeInstance('agent');
    expect(agent2).toBe(agent); // same instance should be updated, not recreated
    expect((agent2 as any).callModelNode?.['systemPrompt']).toBe(newSystemPrompt);
    expect((agent2 as any).llm?.['model']).toBe(newModel);
  });
});
