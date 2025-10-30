
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentRunService } from '../src/graph/nodes/agentRun.repository';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { AIMessage, HumanMessage, ResponseMessage } from '@agyn/llm';
import { Loop, Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';

const countingRuns = (() => {
  let starts = 0;
  return {
    provider: { provide: AgentRunService, useValue: {
      startRun: async () => { starts++; },
      markTerminated: async () => {},
      list: async () => [],
    } },
    get starts() { return starts; }
  };
})();

class PassthroughReducer extends Reducer<LLMState, LLMContext> {
  async invoke(state: LLMState): Promise<LLMState> {
    return { ...state, messages: [...state.messages, new ResponseMessage({ output: [AIMessage.fromText('done').toPlain()] })] };
  }
}

class NoToolAgent extends AgentNode {
  protected override async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    return new Loop<LLMState, LLMContext>({ load: new PassthroughReducer() });
  }
}

describe('Agent busy gating (wait mode)', () => {
  it('does not start a new loop while running; schedules next after finish', async () => {
    const module = await Test.createTestingModule({
      providers: [LoggerService, ConfigService,  { provide: LLMProvisioner, useValue: {} } , countingRuns.provider, NoToolAgent],
    }).compile();
    const agent = await module.resolve(NoToolAgent);
    await agent.setConfig({ whenBusy: 'wait' });
    agent.init({ nodeId: 'A1' });
    const runs = countingRuns;

    const p1 = agent.invoke('t', [HumanMessage.fromText('m1') as any]);
    // Immediately enqueue another message; should not start a second run now
    const p2 = agent.invoke('t', [HumanMessage.fromText('m2') as any]);
    const r2 = await p2; // queued response
    expect(runs.starts).toBe(1);
    expect(r2.text).toBe('queued');
    const r1 = await p1; // first run completes
    expect(r1.text).toBe('done');

    await new Promise((r) => setTimeout(r, 50));
    expect(runs.starts).toBeGreaterThanOrEqual(2);
  });
});
