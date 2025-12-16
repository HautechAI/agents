import { HttpResponse, http } from 'msw';

const NOW = '2024-11-05T12:34:56.000Z';

const threadAlphaId = '11111111-1111-4111-8111-111111111111';
const threadBravoId = '22222222-2222-4222-8222-222222222222';
const childThreadId = '33333333-3333-4333-8333-333333333333';

const graphResponse = {
  name: 'ops-demo-graph',
  version: 12,
  updatedAt: NOW,
  nodes: [
    {
      id: 'workspace-root',
      template: 'workspace.ops',
      position: { x: -320, y: -40 },
      config: { title: 'Ops Workspace' },
    },
    {
      id: 'agent-observer',
      template: 'agent.observer',
      position: { x: 0, y: 0 },
      config: {
        title: 'Ops Observer',
        role: 'Navigator',
        instructions: 'Handle billing investigations',
        secret: '{{ vault:ops/secrets/slack-webhook }}',
      },
    },
    {
      id: 'tool-metrics',
      template: 'tool.metrics',
      position: { x: 360, y: 120 },
      config: { title: 'Metrics Tool', description: 'Graphs infrastructure signals' },
    },
  ],
  edges: [
    {
      id: 'edge-workspace-agent',
      source: 'workspace-root',
      sourceHandle: 'output',
      target: 'agent-observer',
      targetHandle: 'input',
    },
    {
      id: 'edge-agent-tool',
      source: 'agent-observer',
      sourceHandle: 'output',
      target: 'tool-metrics',
      targetHandle: 'input',
    },
  ],
  variables: [
    { key: 'OPS_REGION', value: 'iad' },
    { key: 'OPS_SLACK_WEBHOOK', value: '{{ vault:ops/secrets/slack-webhook }}' },
    { key: 'OPS_DEFAULT_AGENT', value: 'agent-observer' },
  ],
};

const graphTemplates = [
  {
    name: 'workspace.ops',
    title: 'Ops Workspace',
    kind: 'service',
    sourcePorts: { output: 'Output' },
    targetPorts: {},
    capabilities: { provisionable: true },
  },
  {
    name: 'agent.observer',
    title: 'Ops Observer',
    kind: 'agent',
    sourcePorts: { output: 'Agent output' },
    targetPorts: { input: 'Agent input' },
    capabilities: { provisionable: true, dynamicConfigurable: true },
  },
  {
    name: 'tool.metrics',
    title: 'Metrics Tool',
    kind: 'tool',
    sourcePorts: { output: 'Result' },
    targetPorts: { input: 'Query' },
  },
];

const nodeStatuses: Record<string, { provisionStatus: { state: string }; isPaused?: boolean }> = {
  'workspace-root': { provisionStatus: { state: 'ready' } },
  'agent-observer': { provisionStatus: { state: 'ready' } },
  'tool-metrics': { provisionStatus: { state: 'ready' } },
};

const threadNodes = [
  {
    id: threadAlphaId,
    alias: 'OPS-BILLING-AUDIT',
    summary: 'Investigate slow billing queries',
    status: 'open',
    parentId: null,
    createdAt: '2024-11-05T09:12:00Z',
    metrics: { remindersCount: 2, containersCount: 1, activity: 'working', runsCount: 2 },
    agentRole: 'Navigator',
    agentName: 'Atlas',
  },
  {
    id: threadBravoId,
    alias: 'OPS-INCIDENT-481',
    summary: 'Resolve degraded ingestion pipeline',
    status: 'closed',
    parentId: null,
    createdAt: '2024-11-04T18:00:00Z',
    metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 1 },
    agentRole: 'Responder',
    agentName: 'Delta',
  },
  {
    id: childThreadId,
    alias: 'OPS-BILLING-INDEX-CHECK',
    summary: 'Validate new billing indexes',
    status: 'open',
    parentId: threadAlphaId,
    createdAt: '2024-11-05T10:45:00Z',
    metrics: { remindersCount: 1, containersCount: 0, activity: 'waiting', runsCount: 1 },
    agentRole: 'Analyst',
    agentName: 'Helix',
  },
];

const threadChildrenMap = new Map<string, Array<(typeof threadNodes)[number]>>();
threadChildrenMap.set(threadAlphaId, threadNodes.filter((node) => node.parentId === threadAlphaId));
threadChildrenMap.set(childThreadId, []);

const runsByThread: Record<string, Array<{ id: string; threadId: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string }>> = {
  [threadAlphaId]: [
    { id: 'run-alpha-1', threadId: threadAlphaId, status: 'finished', createdAt: '2024-11-05T09:12:00Z', updatedAt: '2024-11-05T09:15:00Z' },
    { id: 'run-alpha-2', threadId: threadAlphaId, status: 'running', createdAt: '2024-11-05T10:05:00Z', updatedAt: '2024-11-05T10:12:00Z' },
  ],
  [threadBravoId]: [
    { id: 'run-bravo-1', threadId: threadBravoId, status: 'finished', createdAt: '2024-11-04T17:40:00Z', updatedAt: '2024-11-04T17:55:00Z' },
  ],
  [childThreadId]: [
    { id: 'run-child-1', threadId: childThreadId, status: 'finished', createdAt: '2024-11-05T10:45:00Z', updatedAt: '2024-11-05T10:58:00Z' },
  ],
};

const runSummaries: Record<string, Record<string, unknown>> = {
  'run-alpha-1': {
    runId: 'run-alpha-1',
    threadId: threadAlphaId,
    status: 'finished',
    createdAt: '2024-11-05T09:12:00Z',
    updatedAt: '2024-11-05T09:15:00Z',
    firstEventAt: '2024-11-05T09:12:05Z',
    lastEventAt: '2024-11-05T09:14:58Z',
    countsByType: {
      invocation_message: 1,
      injection: 0,
      llm_call: 1,
      tool_execution: 1,
      summarization: 1,
    },
    countsByStatus: {
      pending: 0,
      running: 0,
      success: 4,
      error: 0,
      cancelled: 0,
    },
    totalEvents: 4,
  },
  'run-alpha-2': {
    runId: 'run-alpha-2',
    threadId: threadAlphaId,
    status: 'running',
    createdAt: '2024-11-05T10:05:00Z',
    updatedAt: '2024-11-05T10:12:00Z',
    firstEventAt: '2024-11-05T10:05:05Z',
    lastEventAt: '2024-11-05T10:11:58Z',
    countsByType: {
      invocation_message: 1,
      injection: 0,
      llm_call: 1,
      tool_execution: 0,
      summarization: 0,
    },
    countsByStatus: {
      pending: 0,
      running: 2,
      success: 0,
      error: 0,
      cancelled: 0,
    },
    totalEvents: 2,
  },
  'run-bravo-1': {
    runId: 'run-bravo-1',
    threadId: threadBravoId,
    status: 'finished',
    createdAt: '2024-11-04T17:40:00Z',
    updatedAt: '2024-11-04T17:55:00Z',
    firstEventAt: '2024-11-04T17:40:05Z',
    lastEventAt: '2024-11-04T17:54:59Z',
    countsByType: {
      invocation_message: 1,
      injection: 0,
      llm_call: 1,
      tool_execution: 1,
      summarization: 0,
    },
    countsByStatus: {
      pending: 0,
      running: 0,
      success: 3,
      error: 0,
      cancelled: 0,
    },
    totalEvents: 3,
  },
  'run-child-1': {
    runId: 'run-child-1',
    threadId: childThreadId,
    status: 'finished',
    createdAt: '2024-11-05T10:45:00Z',
    updatedAt: '2024-11-05T10:58:00Z',
    firstEventAt: '2024-11-05T10:45:05Z',
    lastEventAt: '2024-11-05T10:57:50Z',
    countsByType: {
      invocation_message: 1,
      injection: 0,
      llm_call: 1,
      tool_execution: 0,
      summarization: 1,
    },
    countsByStatus: {
      pending: 0,
      running: 0,
      success: 3,
      error: 0,
      cancelled: 0,
    },
    totalEvents: 3,
  },
};

const contextItemsCatalog = new Map(
  [
    {
      id: 'ctx-sql-plan',
      role: 'system',
      contentText: 'SQL plan with composite indexes',
      contentJson: null,
      metadata: { source: 'analysis' },
      sizeBytes: 512,
      createdAt: '2024-11-05T09:12:07Z',
    },
    {
      id: 'ctx-grafana-panel',
      role: 'assistant',
      contentText: 'Grafana dashboard link',
      contentJson: null,
      metadata: { panelId: 42 },
      sizeBytes: 128,
      createdAt: '2024-11-05T09:13:00Z',
    },
  ].map((item) => [item.id, item] as const),
);

type RunEventShape = {
  id: string;
  runId: string;
  threadId: string;
  type: 'invocation_message' | 'injection' | 'llm_call' | 'tool_execution' | 'summarization';
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  ts: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  nodeId: string | null;
  sourceKind: 'internal' | 'tracing';
  sourceSpanId: string | null;
  metadata: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  llmCall?: Record<string, unknown>;
  toolExecution?: Record<string, unknown>;
  summarization?: Record<string, unknown>;
  message?: Record<string, unknown>;
  attachments: Array<Record<string, unknown>>;
};

const runEvents: Record<string, RunEventShape[]> = {
  'run-alpha-1': [
    {
      id: 'evt-alpha-1',
      runId: 'run-alpha-1',
      threadId: threadAlphaId,
      type: 'invocation_message',
      status: 'success',
      ts: '2024-11-05T09:12:05Z',
      startedAt: '2024-11-05T09:12:05Z',
      endedAt: '2024-11-05T09:12:05Z',
      durationMs: 0,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: null,
      metadata: {},
      errorCode: null,
      errorMessage: null,
      message: {
        messageId: 'msg-evt-alpha-1',
        role: 'user',
        kind: 'prompt',
        text: 'Please audit slow queries on billing tables.',
        source: null,
        createdAt: '2024-11-05T09:12:05Z',
      },
      attachments: [],
    },
    {
      id: 'evt-alpha-2',
      runId: 'run-alpha-1',
      threadId: threadAlphaId,
      type: 'llm_call',
      status: 'success',
      ts: '2024-11-05T09:12:40Z',
      startedAt: '2024-11-05T09:12:40Z',
      endedAt: '2024-11-05T09:12:45Z',
      durationMs: 5000,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: 'span-alpha-llm',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0,
        topP: 1,
        stopReason: 'stop',
        contextItemIds: ['ctx-sql-plan'],
        newContextItemCount: 1,
        responseText: 'SQL plan shows missing composite index on invoice totals.',
        rawResponse: null,
        toolCalls: [],
        usage: { inputTokens: 1800, cachedInputTokens: 200, outputTokens: 360, reasoningTokens: 0, totalTokens: 2360 },
      },
      attachments: [],
    },
    {
      id: 'evt-alpha-3',
      runId: 'run-alpha-1',
      threadId: threadAlphaId,
      type: 'tool_execution',
      status: 'success',
      ts: '2024-11-05T09:13:10Z',
      startedAt: '2024-11-05T09:13:10Z',
      endedAt: '2024-11-05T09:13:20Z',
      durationMs: 10000,
      nodeId: 'tool-metrics',
      sourceKind: 'internal',
      sourceSpanId: 'span-alpha-tool',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      toolExecution: {
        toolName: 'grafana.panel',
        toolCallId: 'call-1',
        execStatus: 'success',
        input: { panelId: 42 },
        output: { url: 'https://grafana.example/panel/42' },
        errorMessage: null,
        raw: null,
      },
      attachments: [],
    },
    {
      id: 'evt-alpha-4',
      runId: 'run-alpha-1',
      threadId: threadAlphaId,
      type: 'summarization',
      status: 'success',
      ts: '2024-11-05T09:14:58Z',
      startedAt: '2024-11-05T09:14:50Z',
      endedAt: '2024-11-05T09:14:58Z',
      durationMs: 8000,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: 'span-alpha-sum',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      summarization: {
        summaryText: 'Added composite index to invoices_total. Latency back to 120ms.',
        newContextCount: 1,
        oldContextTokens: 500,
        raw: null,
      },
      attachments: [],
    },
  ],
  'run-alpha-2': [
    {
      id: 'evt-alpha-2a',
      runId: 'run-alpha-2',
      threadId: threadAlphaId,
      type: 'invocation_message',
      status: 'success',
      ts: '2024-11-05T10:05:05Z',
      startedAt: '2024-11-05T10:05:05Z',
      endedAt: '2024-11-05T10:05:05Z',
      durationMs: 0,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: null,
      metadata: {},
      errorCode: null,
      errorMessage: null,
      message: {
        messageId: 'msg-alpha-2-request',
        role: 'user',
        kind: 'prompt',
        text: 'Validate the new index impact in staging.',
        source: null,
        createdAt: '2024-11-05T10:05:05Z',
      },
      attachments: [],
    },
    {
      id: 'evt-alpha-2b',
      runId: 'run-alpha-2',
      threadId: threadAlphaId,
      type: 'llm_call',
      status: 'running',
      ts: '2024-11-05T10:10:00Z',
      startedAt: '2024-11-05T10:10:00Z',
      endedAt: null,
      durationMs: null,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: 'span-alpha-llm-2',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0,
        topP: 1,
        stopReason: null,
        contextItemIds: ['ctx-grafana-panel'],
        newContextItemCount: 0,
        responseText: null,
        rawResponse: null,
        toolCalls: [],
        usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 900 },
      },
      attachments: [],
    },
  ],
  'run-bravo-1': [
    {
      id: 'evt-bravo-1',
      runId: 'run-bravo-1',
      threadId: threadBravoId,
      type: 'invocation_message',
      status: 'success',
      ts: '2024-11-04T17:40:05Z',
      startedAt: '2024-11-04T17:40:05Z',
      endedAt: '2024-11-04T17:40:05Z',
      durationMs: 0,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: null,
      metadata: {},
      errorCode: null,
      errorMessage: null,
      message: {
        messageId: 'msg-bravo-request',
        role: 'user',
        kind: 'prompt',
        text: 'Restore ingestion pipeline 481.',
        source: null,
        createdAt: '2024-11-04T17:40:05Z',
      },
      attachments: [],
    },
    {
      id: 'evt-bravo-2',
      runId: 'run-bravo-1',
      threadId: threadBravoId,
      type: 'tool_execution',
      status: 'success',
      ts: '2024-11-04T17:45:00Z',
      startedAt: '2024-11-04T17:45:00Z',
      endedAt: '2024-11-04T17:50:00Z',
      durationMs: 300000,
      nodeId: 'tool-metrics',
      sourceKind: 'internal',
      sourceSpanId: 'span-bravo-tool',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      toolExecution: {
        toolName: 'ops.pipeline-reset',
        toolCallId: 'reset-481',
        execStatus: 'success',
        input: { pipeline: 'ingestion-481' },
        output: { restarted: true },
        errorMessage: null,
        raw: null,
      },
      attachments: [],
    },
    {
      id: 'evt-bravo-3',
      runId: 'run-bravo-1',
      threadId: threadBravoId,
      type: 'summarization',
      status: 'success',
      ts: '2024-11-04T17:54:59Z',
      startedAt: '2024-11-04T17:54:50Z',
      endedAt: '2024-11-04T17:54:59Z',
      durationMs: 9000,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: 'span-bravo-sum',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      summarization: {
        summaryText: 'Pipeline 481 recovered after restart.',
        newContextCount: 1,
        oldContextTokens: 250,
        raw: null,
      },
      attachments: [],
    },
  ],
  'run-child-1': [
    {
      id: 'evt-child-1',
      runId: 'run-child-1',
      threadId: childThreadId,
      type: 'invocation_message',
      status: 'success',
      ts: '2024-11-05T10:45:05Z',
      startedAt: '2024-11-05T10:45:05Z',
      endedAt: '2024-11-05T10:45:05Z',
      durationMs: 0,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: null,
      metadata: {},
      errorCode: null,
      errorMessage: null,
      message: {
        messageId: 'msg-child-request',
        role: 'user',
        kind: 'prompt',
        text: 'Ensure billing indexes exist in prod.',
        source: null,
        createdAt: '2024-11-05T10:45:05Z',
      },
      attachments: [],
    },
    {
      id: 'evt-child-2',
      runId: 'run-child-1',
      threadId: childThreadId,
      type: 'llm_call',
      status: 'success',
      ts: '2024-11-05T10:52:00Z',
      startedAt: '2024-11-05T10:52:00Z',
      endedAt: '2024-11-05T10:52:30Z',
      durationMs: 30000,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: 'span-child-llm',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0,
        topP: 1,
        stopReason: 'stop',
        contextItemIds: ['ctx-sql-plan'],
        newContextItemCount: 1,
        responseText: 'Indexes confirmed in production.',
        rawResponse: null,
        toolCalls: [],
        usage: { inputTokens: 600, cachedInputTokens: 0, outputTokens: 120, reasoningTokens: 0, totalTokens: 720 },
      },
      attachments: [],
    },
    {
      id: 'evt-child-3',
      runId: 'run-child-1',
      threadId: childThreadId,
      type: 'summarization',
      status: 'success',
      ts: '2024-11-05T10:57:50Z',
      startedAt: '2024-11-05T10:57:40Z',
      endedAt: '2024-11-05T10:57:50Z',
      durationMs: 10000,
      nodeId: 'agent-observer',
      sourceKind: 'internal',
      sourceSpanId: 'span-child-sum',
      metadata: {},
      errorCode: null,
      errorMessage: null,
      summarization: {
        summaryText: 'Indexes applied across all shards.',
        newContextCount: 1,
        oldContextTokens: 400,
        raw: null,
      },
      attachments: [],
    },
  ],
};

const runMessages: Record<string, Record<'input' | 'output' | 'injected', Array<{ id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text?: string | null; source: unknown; createdAt: string }>>> = {
  'run-alpha-1': {
    input: [
      {
        id: 'msg-alpha-input-1',
        kind: 'user',
        text: 'Please audit slow queries on the billing tables.',
        source: null,
        createdAt: '2024-11-05T09:12:05Z',
      },
    ],
    output: [
      {
        id: 'msg-alpha-output-1',
        kind: 'assistant',
        text: 'Identified missing composite index; applying fix.',
        source: null,
        createdAt: '2024-11-05T09:14:58Z',
      },
    ],
    injected: [],
  },
  'run-alpha-2': {
    input: [
      {
        id: 'msg-alpha2-input-1',
        kind: 'user',
        text: 'Validate the new index impact in staging.',
        source: null,
        createdAt: '2024-11-05T10:05:05Z',
      },
    ],
    output: [],
    injected: [],
  },
  'run-bravo-1': {
    input: [
      {
        id: 'msg-bravo-input-1',
        kind: 'user',
        text: 'Restore ingestion pipeline 481.',
        source: null,
        createdAt: '2024-11-04T17:40:05Z',
      },
    ],
    output: [
      {
        id: 'msg-bravo-output-1',
        kind: 'assistant',
        text: 'Pipeline restarted and metrics back to normal.',
        source: null,
        createdAt: '2024-11-04T17:54:59Z',
      },
    ],
    injected: [],
  },
  'run-child-1': {
    input: [
      {
        id: 'msg-child-input-1',
        kind: 'user',
        text: 'Ensure billing indexes exist in prod.',
        source: null,
        createdAt: '2024-11-05T10:45:05Z',
      },
    ],
    output: [
      {
        id: 'msg-child-output-1',
        kind: 'assistant',
        text: 'Indexes confirmed across shards.',
        source: null,
        createdAt: '2024-11-05T10:57:50Z',
      },
    ],
    injected: [],
  },
};

const queuedMessages: Record<string, Array<{ id: string; text: string; enqueuedAt: string }>> = {
  [threadAlphaId]: [
    {
      id: 'queued-alpha-1',
      text: 'Share final billing analysis once regression test passes.',
      enqueuedAt: '2024-11-05T10:00:00Z',
    },
  ],
};

const reminders = [
  {
    id: 'rem-1',
    threadId: threadAlphaId,
    note: 'Re-run billing regression tests.',
    at: '2024-11-06T09:00:00Z',
    createdAt: '2024-11-05T09:30:00Z',
    completedAt: null,
    cancelledAt: null,
    status: 'scheduled',
  },
  {
    id: 'rem-2',
    threadId: threadAlphaId,
    note: 'Post RCA summary to Slack.',
    at: '2024-11-06T11:00:00Z',
    createdAt: '2024-11-05T09:45:00Z',
    completedAt: null,
    cancelledAt: null,
    status: 'scheduled',
  },
  {
    id: 'rem-3',
    threadId: threadBravoId,
    note: 'Archive incident timeline.',
    at: '2024-11-04T18:30:00Z',
    createdAt: '2024-11-04T17:30:00Z',
    completedAt: '2024-11-04T18:15:00Z',
    cancelledAt: null,
    status: 'executed',
  },
];

const reminderCounts = reminders.reduce(
  (acc, reminder) => {
    if (reminder.cancelledAt) acc.cancelled += 1;
    else if (reminder.completedAt) acc.executed += 1;
    else acc.scheduled += 1;
    return acc;
  },
  { scheduled: 0, executed: 0, cancelled: 0 },
);

const variableItems = [
  { key: 'OPS_REGION', graph: 'iad', local: 'iad-dev' },
  { key: 'OPS_SLACK_WEBHOOK', graph: '{{ vault:ops/secrets/slack-webhook }}', local: null },
  { key: 'OPS_DEFAULT_AGENT', graph: 'agent-observer', local: null },
];

const containers = [
  {
    containerId: 'ctr-ops-shell',
    threadId: threadAlphaId,
    image: 'registry.example.com/ops-shell:latest',
    name: 'ops-shell-1',
    status: 'running',
    startedAt: '2024-11-05T08:55:00Z',
    lastUsedAt: '2024-11-05T10:11:00Z',
    killAfterAt: null,
    role: 'workspace',
    sidecars: [
      { containerId: 'ctr-ops-dind', role: 'dind', image: 'docker:26-dind', status: 'running', name: 'ops-shell-1-dind' },
    ],
    mounts: [
      { source: '/var/lib/repos', destination: '/workspace' },
    ],
  },
  {
    containerId: 'ctr-monitor',
    threadId: null,
    image: 'registry.example.com/ops-monitor:latest',
    name: 'ops-monitor',
    status: 'running',
    startedAt: '2024-11-04T07:00:00Z',
    lastUsedAt: '2024-11-05T11:45:00Z',
    killAfterAt: null,
    role: 'workspace',
  },
];

const memoryDocs = [{ nodeId: 'ops-memory', scope: 'global' as const }];

const memoryDump = {
  '/': 'Root summary: Ops shared memory.',
  '/briefing': 'Billing incident briefing: indexes missing.',
  '/briefing/next-steps': 'Validate staging + prod parity.',
  '/reports': '',
  '/reports/daily': 'Daily report placeholder.',
};

const memoryDirs = {
  '/briefing': true,
  '/briefing/next-steps': true,
  '/reports': true,
};

function filterThreadsByStatus(status: string | null) {
  if (!status || status === 'all') return threadNodes;
  return threadNodes.filter((thread) => thread.status === status);
}

function buildThreadTree() {
  return threadNodes
    .filter((thread) => thread.parentId == null)
    .map((thread) => ({
      ...thread,
      hasChildren: threadChildrenMap.get(thread.id)?.length ? true : false,
      children: threadChildrenMap.get(thread.id) ?? [],
    }));
}

function buildReminderResponse(params: URLSearchParams) {
  const page = Math.max(1, Number(params.get('page') ?? '1'));
  const pageSize = Math.max(1, Number(params.get('pageSize') ?? '20'));
  const sort = (params.get('sort') ?? 'latest') as string;
  const order = (params.get('order') ?? 'desc') as string;
  const start = (page - 1) * pageSize;
  const pageItems = reminders.slice(start, start + pageSize);
  return {
    items: pageItems,
    page,
    pageSize,
    totalCount: reminders.length,
    pageCount: reminders.length === 0 ? 0 : Math.ceil(reminders.length / pageSize),
    countsByStatus: reminderCounts,
    sortApplied: { key: sort, order },
  };
}

function getRunMessages(runId: string, type: string | null) {
  const bucket = runMessages[runId];
  if (!bucket) return [];
  if (type === 'input' || type === 'output' || type === 'injected') {
    return bucket[type];
  }
  return bucket.output;
}

function getMemoryContent(path: string) {
  if (path === '/' || path === '') return memoryDump['/'];
  return memoryDump[path] ?? '';
}

function getMemoryStat(path: string) {
  const normalized = path || '/';
  const exists = normalized === '/' ? true : Object.prototype.hasOwnProperty.call(memoryDump, normalized);
  const hasSubdocs = Object.keys(memoryDump).some((entry) => entry.startsWith(`${normalized}/`) && entry !== normalized);
  return { exists, hasSubdocs, contentLength: getMemoryContent(normalized).length };
}

export const pageHandlers = [
  http.get('/api/graph', () => HttpResponse.json(graphResponse)),
  http.post('/api/graph', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const nextVersion = graphResponse.version + 1;
    return HttpResponse.json({ ...graphResponse, ...body, version: nextVersion, updatedAt: new Date().toISOString() });
  }),
  http.get('/api/graph/templates', () => HttpResponse.json(graphTemplates)),
  http.get('/api/graph/nodes/:nodeId/status', ({ params }) => {
    const nodeId = params.nodeId as string;
    return HttpResponse.json(nodeStatuses[nodeId] ?? { provisionStatus: { state: 'ready' } });
  }),
  http.get('/api/graph/nodes/:nodeId/state', () => HttpResponse.json({ state: {} })),
  http.get('/api/graph/nodes/:nodeId/dynamic-config/schema', () => HttpResponse.json({ schema: { type: 'object', properties: {} } })),
  http.post('/api/graph/nodes/:nodeId/actions', () => HttpResponse.json({ ok: true })),
  http.get('/api/graph/nodes/:nodeId/reminders', () => HttpResponse.json({ items: [] })),
  http.get('/api/graph/nodes/:nodeId/runs', () => HttpResponse.json({ items: [] })),
  http.get('/api/vault/mounts', () => HttpResponse.json({ items: [] })),
  http.get('/api/vault/kv/:mount/paths', () => HttpResponse.json({ items: [] })),
  http.get('/api/vault/kv/:mount/keys', () => HttpResponse.json({ items: [] })),
  http.get('/api/vault/kv/:mount/read', () => HttpResponse.json({ value: '***redacted***' })),
  http.post('/api/vault/kv/:mount/write', () => HttpResponse.json({ ok: true })),
  http.get('/api/graph/variables', () => HttpResponse.json({ items: variableItems })),
  http.post('/api/graph/variables', async ({ request }) => {
    const payload = (await request.json().catch(() => ({}))) as { key?: string; graph?: string };
    const key = payload.key ?? 'NEW_KEY';
    return HttpResponse.json({ key, graph: payload.graph ?? '' });
  }),
  http.put('/api/graph/variables/:key', async ({ request, params }) => {
    const patch = await request.json().catch(() => ({}));
    return HttpResponse.json({ key: params.key, ...patch });
  }),
  http.delete('/api/graph/variables/:key', () => HttpResponse.json({ ok: true })),
  http.get('/api/agents/threads', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const items = filterThreadsByStatus(status);
    return HttpResponse.json({ items });
  }),
  http.get('/api/agents/threads/tree', () => HttpResponse.json({ items: buildThreadTree() })),
  http.get('/api/agents/threads/:threadId', ({ params }) => {
    const thread = threadNodes.find((node) => node.id === params.threadId);
    if (!thread) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(thread);
  }),
  http.get('/api/agents/threads/:threadId/children', ({ params }) => {
    const children = threadChildrenMap.get(params.threadId as string) ?? [];
    return HttpResponse.json({ items: children });
  }),
  http.get('/api/agents/threads/:threadId/metrics', ({ params }) => {
    const thread = threadNodes.find((node) => node.id === params.threadId);
    if (!thread) return HttpResponse.json({ remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 });
    return HttpResponse.json(thread.metrics ?? { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 });
  }),
  http.get('/api/agents/threads/:threadId/runs', ({ params }) => {
    const items = runsByThread[params.threadId as string] ?? [];
    return HttpResponse.json({ items });
  }),
  http.get('/api/agents/threads/:threadId/queued-messages', ({ params }) => {
    const items = queuedMessages[params.threadId as string] ?? [];
    return HttpResponse.json({ items });
  }),
  http.get('/api/agents/runs/:runId/summary', ({ params }) => {
    const summary = runSummaries[params.runId as string];
    if (!summary) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(summary);
  }),
  http.get('/api/agents/runs/:runId/events', ({ params }) => {
    const items = runEvents[params.runId as string] ?? [];
    return HttpResponse.json({ items, nextCursor: null });
  }),
  http.get('/api/agents/runs/:runId/events/:eventId/output', ({ params }) => {
    const runId = params.runId as string;
    const eventId = params.eventId as string;
    const summary = runSummaries[runId];
    const threadId = (summary && typeof summary.threadId === 'string') ? summary.threadId : threadAlphaId;
    return HttpResponse.json({
      items: [
        {
          runId,
          threadId,
          eventId,
          seqGlobal: 1,
          seqStream: 1,
          source: 'stdout',
          ts: NOW,
          data: 'Tool output sample',
        },
      ],
      terminal: null,
      nextSeq: null,
    });
  }),
  http.get('/api/agents/runs/:runId/messages', ({ request, params }) => {
    const type = new URL(request.url).searchParams.get('type');
    const items = getRunMessages(params.runId as string, type);
    return HttpResponse.json({ items });
  }),
  http.get('/api/agents/context-items', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const ids = params.getAll('ids');
    const items = ids
      .map((id) => contextItemsCatalog.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return HttpResponse.json({ items });
  }),
  http.get('/api/agents/reminders', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const threadId = params.get('threadId');
    const take = Number(params.get('take') ?? '0');
    if (threadId) {
      const items = reminders.filter((reminder) => reminder.threadId === threadId);
      if (take > 0) {
        return HttpResponse.json({ items: items.slice(0, take) });
      }
      return HttpResponse.json({ items });
    }
    return HttpResponse.json(buildReminderResponse(params));
  }),
  http.get('/api/containers', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const threadId = params.get('threadId');
    const items = containers.filter((container) => (threadId ? container.threadId === threadId : true));
    return HttpResponse.json({ items });
  }),
  http.post('/api/containers/:containerId/terminal/sessions', ({ params }) => {
    return HttpResponse.json({
      sessionId: `session-${params.containerId}`,
      token: 'terminal-token',
      wsUrl: 'wss://example.com/terminal',
      expiresAt: '2024-11-05T14:00:00Z',
      negotiated: { shell: 'bash', cols: 120, rows: 32 },
    });
  }),
  http.get('/api/memory/docs', () => HttpResponse.json({ items: memoryDocs })),
  http.get('/api/memory/:nodeId/:scope/dump', ({ params }) => {
    return HttpResponse.json({
      nodeId: params.nodeId,
      scope: params.scope,
      data: memoryDump,
      dirs: memoryDirs,
    });
  }),
  http.get('/api/memory/:nodeId/:scope/list', ({ request }) => {
    const path = new URL(request.url).searchParams.get('path') ?? '/';
    const entries = Object.keys(memoryDump)
      .filter((key) => key !== path && key.startsWith(path === '/' ? '/' : `${path}/`))
      .map((key) => key.replace(path === '/' ? '/' : `${path}/`, '').split('/')[0])
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .map((name) => ({ name, hasSubdocs: true }));
    return HttpResponse.json({ items: entries });
  }),
  http.get('/api/memory/:nodeId/:scope/stat', ({ request }) => {
    const path = new URL(request.url).searchParams.get('path') ?? '/';
    return HttpResponse.json(getMemoryStat(path));
  }),
  http.get('/api/memory/:nodeId/:scope/read', ({ request }) => {
    const path = new URL(request.url).searchParams.get('path') ?? '/';
    return HttpResponse.json({ content: getMemoryContent(path) });
  }),
  http.post('/api/memory/:nodeId/:scope/append', () => HttpResponse.json({ ok: true })),
  http.post('/api/memory/:nodeId/:scope/update', () => HttpResponse.json({ replaced: 1 })),
  http.post('/api/memory/:nodeId/:scope/ensure-dir', () => HttpResponse.json({ ok: true })),
  http.delete('/api/memory/:nodeId/:scope', () => HttpResponse.json({ removed: 1 })),
  http.post('/api/agents/threads', () => HttpResponse.json({ id: threadAlphaId })),
  http.post('/api/agents/threads/:threadId/messages', () => HttpResponse.json({ ok: true })),
  http.patch('/api/agents/threads/:threadId', () => HttpResponse.json({ ok: true })),
  http.post('/api/agents/runs/:runId/terminate', () => HttpResponse.json({ ok: true })),
  http.post('/api/graph/nodes/:nodeId/threads/:threadId/terminate', () => HttpResponse.json({ ok: true })),
];
