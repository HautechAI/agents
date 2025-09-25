import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { LoggerService } from '../services/logger.service';
import { buildTemplateRegistry } from '../templates';
import { LiveGraphRuntime } from '../graph/liveGraph.manager';
import type { GraphDefinition } from '../graph/types';
import { MemoryService } from '../services/memory.service';
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { CallModelNode } from '../lgnodes/callModel.lgnode';

class FakeLLM {
  public captured: BaseMessage[] | null = null;
  withConfig(_cfg: any) {
    return {
      invoke: async (messages: BaseMessage[]) => {
        this.captured = messages;
        return new AIMessage('ok');
      },
    } as any;
  }
}

// Patch SimpleAgent to use FakeLLM in CallModelNode
import * as SimpleAgentModule from '../agents/simple.agent';
const OriginalSimpleAgent = SimpleAgentModule.SimpleAgent;
(SimpleAgentModule as any).SimpleAgent = class extends OriginalSimpleAgent {
  init(config: any) {
    // call original init then replace LLM
    super.init(config);
    // Replace callModelNode llm by reconstructing CallModelNode with FakeLLM and existing tools
    const anyThis: any = this as any;
    const tools = anyThis.toolsNode ? anyThis.toolsNode['tools'] || [] : [];
    anyThis['callModelNode'] = new CallModelNode(tools, new FakeLLM() as any);
    return this;
  }
};

describe('Live runtime memory integration', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: any;
  const logger = new LoggerService();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    db = client.db('test');
  });

  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
    // restore SimpleAgent
    (SimpleAgentModule as any).SimpleAgent = OriginalSimpleAgent;
  });

  it('injects memory system message via connector into CallModel', async () => {
    const reg = buildTemplateRegistry({
      logger,
      containerService: new (require('../services/container.service').ContainerService)(logger),
      configService: new (require('../services/config.service').ConfigService)(),
      slackService: new (require('../services/slack.service').SlackService)(logger),
      checkpointerService: new (require('../services/checkpointer.service').CheckpointerService)(logger),
      db,
    });

    const runtime = new LiveGraphRuntime(logger, reg);

    const graph: GraphDefinition = {
      nodes: [
        { id: 'mem', data: { template: 'memoryNode', config: { scope: 'perThread' } } },
        { id: 'conn', data: { template: 'memoryConnector', config: { placement: 'after_system', content: 'full' } } },
        { id: 'agent', data: { template: 'simpleAgent', config: {} } },
      ],
      edges: [
        { source: 'mem', sourceHandle: '$self', target: 'conn', targetHandle: 'memory' },
        { source: 'conn', sourceHandle: '$self', target: 'agent', targetHandle: 'memory' },
      ],
    };

    await runtime.apply(graph);

    // Seed memory for thread T
    const svc = new MemoryService(db, logger, { nodeId: 'mem', scope: 'perThread', threadResolver: () => 'T' });
    await svc.append('/a', 1);

    // Trigger agent by calling summarize->call_model path via runtime API
    const compiled = (runtime as any).compiledGraphs?.get('default');
    expect(compiled).toBeTruthy();
    const graphRunnable = compiled.graph;

    // Invoke with thread T and a simple message
    const res = await graphRunnable.invoke({ messages: [new AIMessage('hello')] }, { configurable: { thread_id: 'T' } });

    // Inspect LLM captured messages
    // We placed FakeLLM into new CallModelNode; retrieve it
    const agentNode: any = (compiled.nodeInstances as any).get('agent');
    const callNode: any = agentNode['callModelNode'];
    const llm: FakeLLM = callNode['llm'];

    const captured = llm.captured as BaseMessage[];
    expect(captured[0]).toBeInstanceOf(SystemMessage);
    expect(captured[1]).toBeInstanceOf(SystemMessage);
  });
});
