
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentRunService } from '../src/graph/nodes/agentRun.repository';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { HumanMessage } from '@agyn/llm';
import { CallAgentFunctionTool } from '../src/graph/nodes/tools/call_agent/call_agent.tool';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';

const dummyRuns = { provide: AgentRunService, useValue: { startRun: async () => {}, markTerminated: async () => {}, list: async () => [] } };

class BusyAgent extends AgentNode {
  override getCurrentRunId(_threadId: string): string | undefined { return 'run'; }
}

describe('call_agent sync busy', () => {
  it('returns agent_busy error when target thread running', async () => {
    const module = await Test.createTestingModule({
      providers: [LoggerService, ConfigService, dummyRuns, BusyAgent, { provide: LLMProvisioner, useValue: {} }],
    }).compile();
    const agent = await module.resolve(BusyAgent);
    await agent.setConfig({});
    agent.init({ nodeId: 'caller' });
    // Construct CallAgentFunctionTool directly with a simple node wrapper
    const node = { config: { response: 'sync' as const }, agent } as any;
    const tool = new (await import('../src/graph/nodes/tools/call_agent/call_agent.tool')).CallAgentFunctionTool(
      new LoggerService(), node);
    const res = await tool.execute({ input: 'hi', childThreadId: 'x' } as any, { callerAgent: agent, threadId: 'caller-t' } as any);
    expect(res).toContain('agent_busy');
  });
});
