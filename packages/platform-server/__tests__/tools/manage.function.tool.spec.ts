import 'reflect-metadata';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { ManageFunctionTool } from '../../src/nodes/tools/manage/manage.tool';
import type { ManageToolNode, ManageWorkerMetadata } from '../../src/nodes/tools/manage/manage.node';
import type { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';
import type { LLMContext } from '../../src/llm/types';
import { HumanMessage } from '@agyn/llm';

type WorkerAgent = ReturnType<ManageToolNode['getWorkersByName']>[number];

const createMetadata = (overrides: Partial<ManageWorkerMetadata> = {}): ManageWorkerMetadata => {
  const name = overrides.name ?? 'Worker Alpha';
  const role = Object.prototype.hasOwnProperty.call(overrides, 'role') ? overrides.role : undefined;
  const normalizedName = overrides.normalizedName ?? name.toLowerCase();
  const normalizedRole = overrides.normalizedRole ?? (role ? role.toLowerCase() : undefined);
  const displayLabel = overrides.displayLabel ?? (role ? `${name} (${role})` : name);
  const title = overrides.title;
  const legacyKeys = overrides.legacyKeys ?? [];
  return {
    name,
    normalizedName,
    role,
    normalizedRole,
    title,
    displayLabel,
    legacyKeys,
  };
};

const createManageNodeStub = (
  metadata: ManageWorkerMetadata,
  agent: WorkerAgent,
  overrides: Record<string, unknown> = {},
): ManageToolNode => {
  const base = {
    nodeId: 'manage-node',
    config: { enforceUniqueByRole: false },
    listWorkers: vi.fn().mockReturnValue([metadata.displayLabel]),
    getWorkersByName: vi.fn().mockImplementation((name: string) =>
      name.trim().toLowerCase() === metadata.name.toLowerCase() ? [agent] : [],
    ),
    findWorkerByNameAndRole: vi.fn().mockImplementation((_name: string, role: string | undefined) => {
      if (!metadata.role) return undefined;
      if (!role) return undefined;
      return role.trim().toLowerCase() === metadata.role.toLowerCase() ? agent : undefined;
    }),
    findWorkerByLegacyLabel: vi.fn().mockReturnValue(undefined),
    getWorkerMetadata: vi.fn().mockImplementation((value: WorkerAgent) => {
      if (value === agent) return metadata;
      throw new Error('unexpected agent');
    }),
    registerInvocation: vi.fn().mockResolvedValue(undefined),
    awaitChildResponse: vi.fn().mockResolvedValue('child response text'),
    getMode: vi.fn().mockReturnValue('sync'),
    getTimeoutMs: vi.fn().mockReturnValue(64000),
    renderWorkerResponse: vi
      .fn()
      .mockImplementation((worker: string, text: string) => `Response from: ${worker}\n${text}`),
    renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
  } satisfies Record<string, unknown>;
  return Object.assign(base, overrides) as unknown as ManageToolNode;
};

const createCtx = (overrides: Partial<LLMContext> = {}): LLMContext => ({
  threadId: 'parent-thread',
  callerAgent: {
    invoke: vi.fn().mockResolvedValue(undefined),
  },
  ...overrides,
} as unknown as LLMContext);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  (ManageFunctionTool as unknown as { legacyLookupWarningEmitted: boolean }).legacyLookupWarningEmitted = false;
});

describe('ManageFunctionTool.execute', () => {
  it('awaits child response in sync mode and returns formatted text', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-1'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const metadata = createMetadata();
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-1',
      awaitChildResponse: vi.fn().mockResolvedValue('child response text'),
      getMode: vi.fn().mockReturnValue('sync'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hello', threadAlias: undefined }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'worker-alpha', 'parent-thread', '');
    expect(persistence.setThreadChannelNode).toHaveBeenCalledWith('child-thread-1', 'manage-node-1');
    expect(manageNode.registerInvocation).toHaveBeenCalledWith({
      childThreadId: 'child-thread-1',
      parentThreadId: 'parent-thread',
      workerTitle: 'Worker Alpha',
      callerAgent: ctx.callerAgent,
    });
    expect(manageNode.awaitChildResponse).toHaveBeenCalledWith('child-thread-1', 64000);
    expect(workerInvoke).toHaveBeenCalledTimes(1);
    const [, messages] = workerInvoke.mock.calls[0];
    expect(Array.isArray(messages)).toBe(true);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect((messages[0] as HumanMessage).text).toBe('hello');
    expect(manageNode.renderWorkerResponse).toHaveBeenCalledWith('Worker Alpha', 'child response text');
    expect(result).toBe('Response from: Worker Alpha\nchild response text');
  });

  it('reuses provided threadAlias without altering case when accepted', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-alias'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const metadata = createMetadata();
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-alias',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const rawAlias = '  Mixed.Alias-Case_123  ';

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledWith(
      'manage',
      'Mixed.Alias-Case_123',
      'parent-thread',
      '',
    );
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Worker Alpha');
  });

  it('falls back to sanitized alias when provided alias is rejected', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi
        .fn()
        .mockRejectedValueOnce(new Error('invalid alias'))
        .mockResolvedValue('child-thread-fallback'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const metadata = createMetadata();
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-fallback',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerWarnSpy = vi.spyOn((tool as any).logger, 'warn');

    const ctx = createCtx();
    const rawAlias = 'Invalid Alias!';

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    const aliasMock = vi.mocked(persistence.getOrCreateSubthreadByAlias);
    expect(aliasMock).toHaveBeenNthCalledWith(1, 'manage', 'Invalid Alias!', 'parent-thread', '');
    expect(aliasMock).toHaveBeenNthCalledWith(2, 'manage', 'invalid-alias', 'parent-thread', '');
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Manage: provided threadAlias invalid, using sanitized fallback {"workerName":"Worker Alpha","workerLabel":"Worker Alpha","parentThreadId":"parent-thread","providedAlias":"Invalid Alias!","fallbackAlias":"invalid-alias"}',
    );
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Worker Alpha');
  });

  it('fallback alias enforces 64 character limit', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi
        .fn()
        .mockRejectedValueOnce(new Error('too long'))
        .mockResolvedValue('child-thread-long'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const metadata = createMetadata();
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-long',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const rawAlias = 'A'.repeat(100);

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    const aliasMock = vi.mocked(persistence.getOrCreateSubthreadByAlias);
    const fallbackAlias = aliasMock.mock.calls[1][1] as string;
    expect(fallbackAlias.length).toBeLessThanOrEqual(64);
    expect(fallbackAlias).toBe('a'.repeat(64));
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Worker Alpha');
  });

  it('requires role disambiguation when workers share a name', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-shared-name'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const reviewerInvoke = vi.fn().mockResolvedValue({ text: 'review response' });
    const builderInvoke = vi.fn().mockResolvedValue({ text: 'build response' });
    const reviewerAgent = { invoke: reviewerInvoke } as unknown as WorkerAgent;
    const builderAgent = { invoke: builderInvoke } as unknown as WorkerAgent;
    const reviewerMeta = createMetadata({
      name: 'Worker Alpha',
      role: 'Reviewer',
      normalizedRole: 'reviewer',
      displayLabel: 'Worker Alpha (Reviewer)',
      legacyKeys: ['worker alpha (reviewer)'],
    });
    const builderMeta = createMetadata({
      name: 'Worker Alpha',
      role: 'Builder',
      normalizedRole: 'builder',
      displayLabel: 'Worker Alpha (Builder)',
      legacyKeys: ['worker alpha (builder)'],
    });
    const manageNode = {
      nodeId: 'manage-node-duplicates',
      config: { enforceUniqueByRole: true },
      listWorkers: vi.fn().mockReturnValue([reviewerMeta.displayLabel, builderMeta.displayLabel]),
      getWorkersByName: vi.fn().mockImplementation((name: string) =>
        name.trim().toLowerCase() === 'worker alpha' ? [reviewerAgent, builderAgent] : [],
      ),
      findWorkerByNameAndRole: vi.fn().mockImplementation((name: string, role: string | undefined) => {
        if (name.trim().toLowerCase() !== 'worker alpha' || !role) return undefined;
        const normalized = role.trim().toLowerCase();
        if (normalized === 'reviewer') return reviewerAgent;
        if (normalized === 'builder') return builderAgent;
        return undefined;
      }),
      findWorkerByLegacyLabel: vi.fn().mockReturnValue(undefined),
      getWorkerMetadata: vi.fn().mockImplementation((agent: WorkerAgent) => {
        if (agent === reviewerAgent) return reviewerMeta;
        if (agent === builderAgent) return builderMeta;
        throw new Error('unexpected agent');
      }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn().mockResolvedValue('sync response'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi
        .fn()
        .mockImplementation((worker: string, text: string) => `Response from: ${worker}\n${text}`),
      renderAsyncAcknowledgement: vi.fn(),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();

    await expect(
      tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi' }, ctx),
    ).rejects.toThrow(
      'Multiple workers share the name "Worker Alpha". Include the role to disambiguate. Available roles: Reviewer, Builder',
    );
    expect(persistence.getOrCreateSubthreadByAlias).not.toHaveBeenCalled();

    const result = await tool.execute(
      { command: 'send_message', worker: 'Worker Alpha (Reviewer)', message: 'hello reviewer' },
      ctx,
    );

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenLastCalledWith(
      'manage',
      'worker-alpha',
      'parent-thread',
      '',
    );
    expect(manageNode.renderWorkerResponse).toHaveBeenLastCalledWith('Worker Alpha (Reviewer)', 'sync response');
    expect(result).toBe('Response from: Worker Alpha (Reviewer)\nsync response');
  });

  it('falls back to legacy labels and warns once', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-legacy'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'legacy invoke' });
    const metadata = createMetadata({
      name: 'Canonical Worker',
      displayLabel: 'Canonical Worker',
      legacyKeys: ['legacy worker', 'canonical worker'],
      title: 'Legacy Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = {
      nodeId: 'manage-node-legacy',
      config: { enforceUniqueByRole: false },
      listWorkers: vi.fn().mockReturnValue([metadata.displayLabel]),
      getWorkersByName: vi.fn().mockReturnValue([]),
      findWorkerByNameAndRole: vi.fn().mockReturnValue(undefined),
      findWorkerByLegacyLabel: vi.fn().mockImplementation((label: string) =>
        label.trim().toLowerCase() === 'legacy worker' ? workerAgent : undefined,
      ),
      getWorkerMetadata: vi.fn().mockReturnValue(metadata),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn().mockResolvedValue('legacy response'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(0),
      renderWorkerResponse: vi
        .fn()
        .mockImplementation((worker: string, text: string) => `Response from: ${worker}\n${text}`),
      renderAsyncAcknowledgement: vi.fn(),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const warnSpy = vi.spyOn((tool as any).logger, 'warn');
    const ctx = createCtx();

    const first = await tool.execute(
      { command: 'send_message', worker: 'Legacy Worker', message: 'legacy hi' },
      ctx,
    );

    expect(first).toBe('Response from: Canonical Worker\nlegacy response');
    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenLastCalledWith(
      'manage',
      'canonical-worker',
      'parent-thread',
      '',
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Manage: worker lookup matched legacy label {"provided":"Legacy Worker","workerName":"Canonical Worker","workerLabel":"Canonical Worker"}',
    );

    warnSpy.mockClear();
    await tool.execute({ command: 'send_message', worker: 'Legacy Worker', message: 'again' }, ctx);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns acknowledgement in async mode without awaiting child response', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-2'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'ignored' });
    const metadata = createMetadata({
      name: 'Async Worker',
      normalizedName: 'async worker',
      displayLabel: 'Async Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-2',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalled();
    expect(persistence.setThreadChannelNode).toHaveBeenCalledWith('child-thread-2', 'manage-node-2');
    expect(manageNode.awaitChildResponse).not.toHaveBeenCalled();
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Async Worker');
    expect(workerInvoke).toHaveBeenCalledTimes(1);
    expect(result).toBe('async acknowledgement');
  });

  it('logs and continues when async invoke returns non-promise', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-non-promise'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockReturnValue({ text: 'sync result' });
    const metadata = createMetadata({
      name: 'Async Worker',
      normalizedName: 'async worker',
      displayLabel: 'Async Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-non-promise',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx);

    expect(result).toBe('async acknowledgement');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: async send_message invoke returned non-promise {"workerName":"Async Worker","workerLabel":"Async Worker","childThreadId":"child-thread-non-promise","resultType":"object","promiseLike":false}',
    );
  });

  it('returns acknowledgement immediately for delayed async invocation and logs no errors', async () => {
    vi.useFakeTimers();

    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-delayed'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => resolve({ text: 'late reply' }), 2000);
      }),
    );
    const metadata = createMetadata({
      name: 'Async Worker',
      normalizedName: 'async worker',
      displayLabel: 'Async Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-delayed',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx),
    ).resolves.toBe('async acknowledgement');

    expect(loggerErrorSpy).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('logs async non-error rejections without crashing', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-async'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue('boom');
    const metadata = createMetadata({
      name: 'Async Worker',
      normalizedName: 'async worker',
      displayLabel: 'Async Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-async',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"workerName":"Async Worker","workerLabel":"Async Worker","childThreadId":"child-thread-async","matchType":"name","error":{"code":"unknown_error","message":"boom","retriable":false}}',
      );
    });
  });

  it('logs async undefined rejections without crashing', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-undefined'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue(undefined);
    const metadata = createMetadata({
      name: 'Async Worker',
      normalizedName: 'async worker',
      displayLabel: 'Async Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-undefined',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"workerName":"Async Worker","workerLabel":"Async Worker","childThreadId":"child-thread-undefined","matchType":"name","error":{"code":"unknown_error","message":"undefined","retriable":false}}',
      );
    });
  });

  it('logs async non-error object rejections using message field', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-object'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const diagnostic = { message: 'custom diagnostic', code: 'X' };
    const workerInvoke = vi.fn().mockRejectedValue(diagnostic);
    const metadata = createMetadata({
      name: 'Async Worker',
      normalizedName: 'async worker',
      displayLabel: 'Async Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-object',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"workerName":"Async Worker","workerLabel":"Async Worker","childThreadId":"child-thread-object","matchType":"name","error":{"code":"X","message":"custom diagnostic","retriable":false}}',
      );
    });
  });

  it('rethrows non-error rejections and logs safely', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-sync'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue('boom');
    const metadata = createMetadata({
      name: 'Fail Worker',
      normalizedName: 'fail worker',
      displayLabel: 'Fail Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-sync',
      awaitChildResponse: vi.fn().mockResolvedValue('ignored'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn(),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Fail Worker', message: 'fail', threadAlias: undefined }, ctx),
    ).rejects.toBe('boom');

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: send_message failed {"workerName":"Fail Worker","workerLabel":"Fail Worker","childThreadId":"child-thread-sync","matchType":"name","error":{"code":"unknown_error","message":"boom","retriable":false}}',
    );
  });

  it('rethrows non-error objects while logging their message', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-sync-object'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const diagnostic = { message: 'sync diagnostic', code: 'Y' };
    const workerInvoke = vi.fn().mockRejectedValue(diagnostic);
    const metadata = createMetadata({
      name: 'Fail Worker',
      normalizedName: 'fail worker',
      displayLabel: 'Fail Worker',
    });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(metadata, workerAgent, {
      nodeId: 'manage-node-sync-object',
      awaitChildResponse: vi.fn().mockResolvedValue('ignored'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn(),
    });

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Fail Worker', message: 'fail', threadAlias: undefined }, ctx),
    ).rejects.toEqual(diagnostic);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: send_message failed {"workerName":"Fail Worker","workerLabel":"Fail Worker","childThreadId":"child-thread-sync-object","matchType":"name","error":{"code":"Y","message":"sync diagnostic","retriable":false}}',
    );
  });
});
