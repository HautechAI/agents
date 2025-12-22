import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { FunctionTool } from '@agyn/llm';

const EmptySchema = z.object({});

class StaticFunctionTool extends FunctionTool<typeof EmptySchema> {
  private readonly schemaImpl = EmptySchema;

  constructor(private readonly meta: { name: string; description: string }) {
    super();
  }

  get name(): string {
    return this.meta.name;
  }

  get schema(): typeof EmptySchema {
    return this.schemaImpl;
  }

  get description(): string {
    return this.meta.description;
  }

  async execute(): Promise<never> {
    throw new Error('not implemented');
  }
}

const createAgentHarness = async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService().init(
          configSchema.parse({
            llmProvider: 'openai',
            agentsDatabaseUrl: 'postgres://localhost/agents',
            litellmBaseUrl: 'http://localhost:4000',
            litellmMasterKey: 'sk-test',
          }),
        ),
      },
      {
        provide: LLMProvisioner,
        useValue: { getLLM: vi.fn() },
      },
      AgentNode,
    ],
  }).compile();

  const agent = await moduleRef.resolve(AgentNode);
  agent.init({ nodeId: 'agent-test' });

  return { moduleRef, agent };
};

describe('AgentNode system prompt templating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders tool context inside the system prompt', async () => {
    const { moduleRef, agent } = await createAgentHarness();
    await agent.setConfig({ systemPrompt: 'Available tools:\n{{#tools}}- {{name}} :: {{prompt}}\n{{/tools}}' });

    const tools = [
      new StaticFunctionTool({ name: 'alpha', description: 'alpha description' }),
      new StaticFunctionTool({ name: 'beta', description: 'beta description' }),
    ];

    const effective = (agent as unknown as { buildEffectiveConfig: (model: string, tools: FunctionTool[]) => any }).buildEffectiveConfig(
      'gpt-test',
      tools,
    );

    expect(effective.prompts.system).toContain('- alpha :: alpha description');
    expect(effective.prompts.system).toContain('- beta :: beta description');

    await moduleRef.close();
  });

  it('omits section when no tools are registered', async () => {
    const { moduleRef, agent } = await createAgentHarness();
    await agent.setConfig({ systemPrompt: 'Tools list:{{#tools}} {{name}}{{/tools}} end.' });

    const effective = (agent as unknown as { buildEffectiveConfig: (model: string, tools: FunctionTool[]) => any }).buildEffectiveConfig(
      'gpt-test',
      [],
    );

    expect(effective.prompts.system).toBe('Tools list: end.');

    await moduleRef.close();
  });
});
