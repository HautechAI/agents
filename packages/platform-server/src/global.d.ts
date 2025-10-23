declare global {
  var liveGraphRuntime: import('./graph/liveGraph.manager').LiveGraphRuntime | undefined;
  var __agentRunsService: import('./nodes/agentRun.repository').AgentRunService | undefined;
}
export {};
