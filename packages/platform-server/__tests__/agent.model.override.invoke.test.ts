import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentNode as Agent } from '../src/graph/nodes/agent/agent.node';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';

describe('Agent model override at runtime', () => {
  it('uses override model at invoke after setConfig', async () => {
    const provisioner = { getLLM: async () => ({ call: async ({ model }: { model: string }) => new ResponseMessage({ output: [AIMessage.fromText(`model:${model}`).toPlain()] }) }) };
    // Minimal DI-less instantiation with stubs
    const cfg = new ConfigService().init({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm',
      llmProvider: 'openai', agentsDatabaseUrl: 'postgres://x', graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: ['nixpkgs-unstable'], nixHttpTimeoutMs: 200, nixCacheTtlMs: 300000, nixCacheMax: 500,
      mcpToolsStaleTimeoutMs: 0, ncpsEnabled: false, ncpsUrl: 'http://ncps:8501', ncpsUrlServer: 'http://ncps:8501', ncpsUrlContainer: 'http://ncps:8501', ncpsPubkeyPath: '/pubkey', ncpsFetchTimeoutMs: 3000, ncpsRefreshIntervalMs: 0, ncpsStartupMaxRetries: 8, ncpsRetryBackoffMs: 500, ncpsRetryBackoffFactor: 2, ncpsAllowStartWithoutKey: true,
    } as any);
    const agent = new Agent(cfg, new LoggerService(), provisioner as any, { startRun: async () => {}, markTerminated: async () => {}, markTerminating: async () => 'not_running', list: async () => [] } as any, { create: async (Cls: any) => new Cls() } as any);
    agent.init({ nodeId: 'agent-1' });
    await agent.setConfig({ model: 'override-model' });
    const res = await agent.invoke('thread-1', [HumanMessage.fromText('hello')]);
    expect(res.text).toBe('model:override-model');
  });
});
