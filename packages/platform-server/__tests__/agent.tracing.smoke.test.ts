import { describe, it, expect, vi } from 'vitest';
import * as tracing from '@agyn/tracing';
import { AgentStaticConfig } from '../src/graph/nodes/agent/agent.node';
import { HumanMessage } from '@agyn/llm';
import { ModuleRef } from '@nestjs/core';
import { ThreadLockService } from '../src/graph/nodes/agent/threadLock.service';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { Loop, Reducer, AIMessage, ResponseMessage } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';

class NoopLogger extends LoggerService { constructor() { super(); } }
class DummyConfig extends ConfigService { constructor() { super(); } }
class DummyRuns { async startRun() {}; async markTerminated() {}; async list(){ return []; } }

class TestAgent extends AgentNode {
  protected async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    const reducers: Record<string, Reducer<LLMState, LLMContext>> = {};
    reducers['load'] = new (class extends Reducer<LLMState, LLMContext> {
      async invoke(state: LLMState): Promise<LLMState> {
        const ai = AIMessage.fromText('ok');
        const resp = new ResponseMessage({ output: [ai.toPlain()] });
        return { ...state, messages: [...state.messages, resp] };
      }
    })();
    return new Loop(reducers);
  }
}

describe('Agent tracing', () => {
  it('withAgent wraps run with threadId/nodeId/runId', async () => {
    const spy = vi.spyOn(tracing, 'withAgent').mockImplementation(async (attrs: any, fn: any) => {
      (globalThis as any).__seen = attrs;
      return await fn();
    });
    const logger = new NoopLogger();
    const cfg = new DummyConfig();
    const provisioner: LLMProvisioner = { getLLM: async () => { throw new Error('not used'); } } as LLMProvisioner;
    const runs = new DummyRuns() as any;
    const moduleRef = { create: async () => { throw new Error('not used'); } } as unknown as ModuleRef;
    const locks = new ThreadLockService();
    const agent = new TestAgent(cfg as any, logger, provisioner, runs, locks, moduleRef);
    (agent as any).init({ nodeId: 'agent-T' });
    (agent as any)._config = { whenBusy: 'wait', processBuffer: 'allTogether', debounceMs: 0, model: 'm', systemPrompt: 's', maxContinueIterations: 1 } as AgentStaticConfig;
    const t = 't-trace';
    await agent.invoke(t, [HumanMessage.fromText('x')]);
    const seen = (globalThis as any).__seen as Record<string, unknown>;
    expect(seen.threadId).toBe(t);
    expect(seen.nodeId).toBe('agent-T');
    expect(typeof seen.runId).toBe('string');
    spy.mockRestore();
  });
});
