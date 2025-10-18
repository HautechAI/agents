import { describe, it, expect } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/services/logger.service';
import { ContainerService } from '../src/services/container.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import { MongoService } from '../src/services/mongo.service';
import { MongoClient } from 'mongodb';

// Minimal stubs for services used by template registry
class MockLogger extends LoggerService { info=() => {}; debug=() => {}; error=() => {}; }
class MockContainerService extends ContainerService { constructor(){ super({} as any, new MockLogger()); } }
class MockMongo extends MongoService { getDb(): any { return {} as any; } }

describe('LiveGraphRuntime + SimpleAgent lifecycle', () => {
  it('create -> configure/start, update -> configure, remove -> stop/delete', async () => {
    const logger = new MockLogger();
    const config = new ConfigService({ openaiApiKey: 'x' } as any);
    const cps = new CheckpointerService(logger, new MongoClient('mongodb://unused'));
    const mongo = new MockMongo();
    const registry = buildTemplateRegistry({ logger, containerService: new MockContainerService(), configService: config, checkpointerService: cps, mongoService: mongo });
    const rt = new LiveGraphRuntime(logger, registry);
    const graph1 = { nodes: [ { id: 'A', data: { template: 'simpleAgent', config: { systemPrompt: 'X' } } } ], edges: [] } as any;
    const res1 = await rt.apply(graph1);
    expect(res1.addedNodes).toContain('A');

    // Update config
    const graph2 = { nodes: [ { id: 'A', data: { template: 'simpleAgent', config: { systemPrompt: 'Y' } } } ], edges: [] } as any;
    const res2 = await rt.apply(graph2);
    expect(res2.updatedConfigNodes).toContain('A');

    // Remove node
    const graph3 = { nodes: [], edges: [] } as any;
    const res3 = await rt.apply(graph3);
    expect(res3.removedNodes).toContain('A');
  });
});
