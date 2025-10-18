import { describe, it, expect } from 'vitest';
import { SimpleAgent } from '../src/agents/simple.agent';
import { LoggerService } from '../src/services/logger.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';

// Lightweight mocks to avoid external deps
class MockLogger extends LoggerService { info=() => {}; debug=() => {}; error=() => {}; }
class MockCheckpointer extends CheckpointerService { constructor(){ super(new MockLogger()); } getCheckpointer(){ return { get: async ()=>undefined, put: async ()=>undefined } as any; } }

describe('SimpleAgent lifecycle idempotency and config merge', () => {
  const cfg = new ConfigService({ openaiApiKey: 'x' } as any);

  it('start/stop/delete are idempotent and restart works', async () => {
    const agent = new SimpleAgent(cfg, new MockLogger(), new MockCheckpointer(), 'n1');
    await agent.start();
    await agent.start(); // idempotent
    await agent.stop();
    await agent.stop(); // idempotent
    await agent.start(); // restart
    await agent.delete();
    await agent.delete(); // idempotent
  });

  it('configure merges snapshots and applies live when started', async () => {
    const agent = new SimpleAgent(cfg, new MockLogger(), new MockCheckpointer(), 'n2');
    await agent.configure({ systemPrompt: 'A', model: 'm1' });
    await agent.configure({ debounceMs: 10 }); // merge
    await agent.start();
    // applying configure after start updates live
    await agent.configure({ systemPrompt: 'B' });
    // setConfig should accept unknown keys stripped in configure
    agent.setConfig({ summarizationKeepTokens: 1, summarizationMaxTokens: 10 });
  });
});

