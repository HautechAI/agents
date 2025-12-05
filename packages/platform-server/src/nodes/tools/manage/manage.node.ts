import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { HumanMessage } from '@agyn/llm';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import { AgentNode } from '../../agent/agent.node';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import type { SendResult } from '../../../messaging/types';
import { ThreadChannelNode } from '../../../messaging/threadTransport.service';
import type { CallerAgent } from '../../../llm/types';

export const ManageToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name. Default: Manage'),
    mode: z
      .enum(['sync', 'async'])
      .default('sync')
      .describe('Determines whether Manage waits for child responses or forwards asynchronously.'),
    timeoutMs: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Timeout in milliseconds when waiting for child responses in sync mode. 0 disables timeout.'),
    enforceUniqueByRole: z
      .boolean()
      .default(false)
      .describe('When true, include role in Manage worker uniqueness checks.'),
  })
  .strict();

const normalizeString = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

const normalizeKey = (value: string): string => value.trim().normalize('NFKC').toLowerCase();

export type ManageWorkerMetadata = {
  name: string;
  normalizedName: string;
  role?: string;
  normalizedRole?: string;
  title?: string;
  displayLabel: string;
  legacyKeys: string[];
};

@Injectable({ scope: Scope.TRANSIENT })
export class ManageToolNode extends BaseToolNode<z.infer<typeof ManageToolStaticConfigSchema>> implements ThreadChannelNode {
  private tool?: ManageFunctionTool;
  private readonly workers: Set<AgentNode> = new Set();
  private readonly workerMetadata: Map<AgentNode, ManageWorkerMetadata> = new Map();
  private readonly workersByName: Map<string, Set<AgentNode>> = new Map();
  private readonly workersByLegacyLabel: Map<string, AgentNode> = new Map();
  private readonly uniquenessIndex: Map<string, AgentNode> = new Map();
  private readonly invocationContexts: Map<string, { parentThreadId: string; workerTitle: string; callerAgent: CallerAgent }>
    = new Map();
  private readonly pendingWaiters: Map<string, { resolve: (text: string) => void; reject: (err: Error) => void }>
    = new Map();
  private readonly timeoutHandles: Map<string, NodeJS.Timeout> = new Map();
  private readonly queuedMessages: Map<string, string[]> = new Map();

  constructor(
    @Inject(ManageFunctionTool) private readonly manageTool: ManageFunctionTool,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {
    super();
  }

  addWorker(agent: AgentNode): void {
    if (!agent) throw new Error('ManageToolNode: agent instance is required');
    if (this.workers.has(agent)) return;
    const metadata = this.resolveWorkerMetadata(agent);
    this.assertUniqueConstraints(agent, metadata);
    this.workers.add(agent);
    this.workerMetadata.set(agent, metadata);
    this.indexWorker(agent, metadata);
  }

  removeWorker(agent: AgentNode): void {
    if (!agent) return;
    this.workers.delete(agent);
    const metadata = this.workerMetadata.get(agent);
    if (!metadata) return;
    this.deindexWorker(agent, metadata);
    this.workerMetadata.delete(agent);
  }

  listWorkers(): string[] {
    return Array.from(this.workers).map((worker) => this.ensureMetadata(worker).displayLabel);
  }

  getWorkers(): AgentNode[] {
    return Array.from(this.workers);
  }

  getWorkerMetadata(agent: AgentNode): ManageWorkerMetadata {
    return this.ensureMetadata(agent);
  }

  getWorkersByName(name: string): AgentNode[] {
    const normalizedName = normalizeKey(name);
    if (!normalizedName) return [];
    const bucket = this.workersByName.get(normalizedName);
    if (!bucket) return [];
    const agents = Array.from(bucket);
    for (const agent of agents) this.ensureMetadata(agent);
    const refreshed = this.workersByName.get(normalizedName);
    return refreshed ? Array.from(refreshed) : [];
  }

  findWorkerByNameAndRole(name: string, role: string | undefined): AgentNode | undefined {
    const normalizedName = normalizeKey(name);
    if (!normalizedName) return undefined;
    const bucket = this.workersByName.get(normalizedName);
    if (!bucket || bucket.size === 0) return undefined;
    const normalizedRole = role ? normalizeKey(role) : '';
    for (const agent of Array.from(bucket)) {
      const meta = this.ensureMetadata(agent);
      const existingRole = meta.normalizedRole ?? '';
      if (existingRole === normalizedRole) return agent;
    }
    return undefined;
  }

  findWorkerByLegacyLabel(label: string): AgentNode | undefined {
    const normalizedLabel = normalizeKey(label);
    if (!normalizedLabel) return undefined;
    const agent = this.workersByLegacyLabel.get(normalizedLabel);
    if (!agent) return undefined;
    const metadata = this.ensureMetadata(agent);
    if (!metadata.legacyKeys.includes(normalizedLabel)) {
      const mapped = this.workersByLegacyLabel.get(normalizedLabel);
      if (mapped === agent) this.workersByLegacyLabel.delete(normalizedLabel);
      return undefined;
    }
    return agent;
  }

  private resolveWorkerMetadata(agent: AgentNode): ManageWorkerMetadata {
    let config: AgentNode['config'];
    try {
      config = agent.config;
    } catch (_err) {
      throw new Error('ManageToolNode: worker agent missing configuration');
    }

    const name = normalizeString(config.name);
    if (!name) {
      throw new Error('ManageToolNode: worker agent requires non-empty name');
    }

    const role = normalizeString(config.role) || undefined;
    const title = normalizeString(config.title) || undefined;
    const normalizedName = normalizeKey(name);
    const normalizedRole = role ? normalizeKey(role) : undefined;
    const displayLabel = role ? `${name} (${role})` : name;
    const legacyKeys = new Set<string>();
    legacyKeys.add(normalizeKey(displayLabel));
    if (title) legacyKeys.add(normalizeKey(title));

    return {
      name,
      normalizedName,
      role,
      normalizedRole,
      title,
      displayLabel,
      legacyKeys: Array.from(legacyKeys),
    };
  }

  protected createTool() {
    return this.manageTool.init(this, { persistence: this.persistence });
  }

  getTool() {
    if (!this.tool) this.tool = this.createTool();
    return this.tool;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' } },
      sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } },
    } as const;
  }

  getMode(): 'sync' | 'async' {
    return this.config.mode ?? 'sync';
  }

  getTimeoutMs(): number {
    const raw = this.config.timeoutMs;
    if (!Number.isFinite(raw)) return 0;
    const normalized = Math.trunc(raw as number);
    return normalized >= 0 ? normalized : 0;
  }

  private getUniquenessKey(metadata: ManageWorkerMetadata): string {
    if (this.shouldEnforceUniqueByRole(metadata)) {
      return `${metadata.normalizedName}::${metadata.normalizedRole ?? ''}`;
    }
    return metadata.normalizedName;
  }

  private shouldEnforceUniqueByRole(metadata: ManageWorkerMetadata): boolean {
    if (!this.config.enforceUniqueByRole) return false;
    return !!metadata.role;
  }

  private assertUniqueConstraints(agent: AgentNode, metadata: ManageWorkerMetadata): void {
    const uniquenessKey = this.getUniquenessKey(metadata);
    const uniquenessHolder = this.uniquenessIndex.get(uniquenessKey);
    if (uniquenessHolder && uniquenessHolder !== agent) {
      const existingMeta = this.workerMetadata.get(uniquenessHolder);
      const roleLabel = metadata.role ?? existingMeta?.role ?? undefined;
      if (this.config.enforceUniqueByRole && roleLabel) {
        throw new Error(
          `ManageToolNode: worker with name "${metadata.name}" and role "${roleLabel}" already exists`,
        );
      }
      throw new Error(`ManageToolNode: worker with name "${metadata.name}" already exists`);
    }

    const bucket = this.workersByName.get(metadata.normalizedName);
    if (!bucket || bucket.size === 0) return;

    if (!this.config.enforceUniqueByRole) {
      throw new Error(`ManageToolNode: worker with name "${metadata.name}" already exists`);
    }

    for (const existingAgent of bucket) {
      if (existingAgent === agent) continue;
      const existingMeta = this.workerMetadata.get(existingAgent);
      const existingRole = existingMeta?.normalizedRole ?? '';
      const currentRole = metadata.normalizedRole ?? '';
      if (!existingRole || !currentRole || existingRole === currentRole) {
        const roleLabel = metadata.role ?? existingMeta?.role ?? undefined;
        if ((existingRole || currentRole) && roleLabel) {
          throw new Error(
            `ManageToolNode: worker with name "${metadata.name}" and role "${roleLabel}" already exists`,
          );
        }
        throw new Error(`ManageToolNode: worker with name "${metadata.name}" already exists`);
      }
    }
  }

  private indexWorker(agent: AgentNode, metadata: ManageWorkerMetadata): void {
    const bucket = this.workersByName.get(metadata.normalizedName) ?? new Set<AgentNode>();
    if (!this.workersByName.has(metadata.normalizedName)) {
      this.workersByName.set(metadata.normalizedName, bucket);
    }
    bucket.add(agent);
    this.uniquenessIndex.set(this.getUniquenessKey(metadata), agent);
    for (const key of metadata.legacyKeys) {
      this.workersByLegacyLabel.set(key, agent);
    }
  }

  private deindexWorker(agent: AgentNode, metadata: ManageWorkerMetadata): void {
    const bucket = this.workersByName.get(metadata.normalizedName);
    if (bucket) {
      bucket.delete(agent);
      if (bucket.size === 0) {
        this.workersByName.delete(metadata.normalizedName);
      }
    }
    const uniquenessKey = this.getUniquenessKey(metadata);
    const holder = this.uniquenessIndex.get(uniquenessKey);
    if (holder === agent) {
      this.uniquenessIndex.delete(uniquenessKey);
    }
    for (const key of metadata.legacyKeys) {
      const mapped = this.workersByLegacyLabel.get(key);
      if (mapped === agent) {
        this.workersByLegacyLabel.delete(key);
      }
    }
  }

  private ensureMetadata(agent: AgentNode): ManageWorkerMetadata {
    const current = this.workerMetadata.get(agent);
    if (!current) throw new Error('ManageToolNode: worker metadata unavailable');
    const refreshed = this.resolveWorkerMetadata(agent);
    if (this.metadataEquals(current, refreshed)) return current;

    this.deindexWorker(agent, current);
    try {
      this.assertUniqueConstraints(agent, refreshed);
    } catch (err) {
      this.indexWorker(agent, current);
      throw err;
    }

    this.workerMetadata.set(agent, refreshed);
    this.indexWorker(agent, refreshed);
    return refreshed;
  }

  private metadataEquals(a: ManageWorkerMetadata, b: ManageWorkerMetadata): boolean {
    if (a === b) return true;
    if (a.name !== b.name) return false;
    if (a.normalizedName !== b.normalizedName) return false;
    if ((a.role ?? '') !== (b.role ?? '')) return false;
    if ((a.normalizedRole ?? '') !== (b.normalizedRole ?? '')) return false;
    if ((a.title ?? '') !== (b.title ?? '')) return false;
    if (a.displayLabel !== b.displayLabel) return false;
    if (a.legacyKeys.length !== b.legacyKeys.length) return false;
    const aKeys = [...a.legacyKeys].sort();
    const bKeys = [...b.legacyKeys].sort();
    for (let i = 0; i < aKeys.length; i += 1) {
      if (aKeys[i] !== bKeys[i]) return false;
    }
    return true;
  }

  async registerInvocation(context: { childThreadId: string; parentThreadId: string; workerTitle: string; callerAgent: CallerAgent }): Promise<void> {
    const trimmedChildId = context.childThreadId.trim();
    if (!trimmedChildId) return;

    const existingContext = this.invocationContexts.get(trimmedChildId);
    if (existingContext) {
      await this.flushQueuedMessages(trimmedChildId, existingContext);
    } else {
      await this.flushQueuedMessages(trimmedChildId, undefined);
    }

    this.invocationContexts.set(trimmedChildId, {
      parentThreadId: context.parentThreadId,
      workerTitle: context.workerTitle,
      callerAgent: context.callerAgent,
    });
  }

  async awaitChildResponse(childThreadId: string, timeoutMs: number): Promise<string> {
    const trimmed = childThreadId.trim();
    if (!trimmed) throw new Error('manage_invalid_child_thread');

    const queued = this.dequeueMessage(trimmed);
    if (queued !== undefined) {
      return queued;
    }

    if (this.pendingWaiters.has(trimmed)) {
      throw new Error('manage_waiter_already_registered');
    }

    return await new Promise<string>((resolve, reject) => {
      const candidate = Number.isFinite(timeoutMs) ? Math.trunc(timeoutMs) : this.getTimeoutMs();
      const safeTimeout = Math.max(0, candidate);
      let timer: NodeJS.Timeout | null = null;
      if (safeTimeout > 0) {
        timer = setTimeout(() => {
          this.pendingWaiters.delete(trimmed);
          this.timeoutHandles.delete(trimmed);
          reject(new Error('manage_timeout'));
        }, safeTimeout);
        this.timeoutHandles.set(trimmed, timer);
      } else {
        this.timeoutHandles.delete(trimmed);
      }
      this.pendingWaiters.set(trimmed, {
        resolve: (text) => {
          if (timer) {
            clearTimeout(timer);
            this.timeoutHandles.delete(trimmed);
          }
          this.pendingWaiters.delete(trimmed);
          resolve(text);
        },
        reject: (err) => {
          if (timer) {
            clearTimeout(timer);
            this.timeoutHandles.delete(trimmed);
          }
          this.pendingWaiters.delete(trimmed);
          reject(err);
        },
      });
    });
  }

  async sendToChannel(threadId: string, text: string): Promise<SendResult> {
    const normalizedThreadId = threadId?.trim();
    if (!normalizedThreadId) {
      return { ok: false, error: 'missing_thread_id' };
    }
    const trimmedMessage = text.trim();
    if (!trimmedMessage) {
      return { ok: false, error: 'empty_message' };
    }

    const mode = this.getMode();
    const waiter = this.pendingWaiters.get(normalizedThreadId);
    if (waiter) {
      waiter.resolve(text);
      return { ok: true, threadId: normalizedThreadId };
    }

    if (mode === 'sync') {
      this.enqueueMessage(normalizedThreadId, text);
      return { ok: true, threadId: normalizedThreadId };
    }

    const context = this.invocationContexts.get(normalizedThreadId);
    if (!context) {
      this.logger.warn?.(
        `ManageToolNode: async response received without invocation context${this.format({ threadId: normalizedThreadId })}`,
      );
      return { ok: false, error: 'missing_invocation_context', threadId: normalizedThreadId };
    }

    try {
      await this.forwardToParent(context, text, normalizedThreadId);
      return { ok: true, threadId: normalizedThreadId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error?.(
        `ManageToolNode: failed to forward async response${this.format({ childThreadId: normalizedThreadId, parentThreadId: context.parentThreadId, error: message })}`,
      );
      return { ok: false, error: 'forward_failed', threadId: normalizedThreadId };
    }
  }

  renderWorkerResponse(workerTitle: string, text: string): string {
    if (!text) return `Response from: ${workerTitle}`;
    return `Response from: ${workerTitle}` + '\n' + text;
  }

  renderAsyncAcknowledgement(workerTitle: string): string {
    return `Request sent to ${workerTitle}; response will follow asynchronously.`;
  }

  private async forwardToParent(
    context: { parentThreadId: string; workerTitle: string; callerAgent: CallerAgent },
    text: string,
    _childThreadId: string,
  ): Promise<void> {
    const formatted = this.renderWorkerResponse(context.workerTitle, text);
    await context.callerAgent.invoke(context.parentThreadId, [HumanMessage.fromText(formatted)]);
  }

  private async flushQueuedMessages(
    childThreadId: string,
    context?: { parentThreadId: string; workerTitle: string; callerAgent: CallerAgent },
  ): Promise<void> {
    const queue = this.queuedMessages.get(childThreadId);
    if (!queue || queue.length === 0) return;
    this.queuedMessages.delete(childThreadId);

    if (!context) {
      this.logger.warn?.(
        `ManageToolNode: discarding queued messages due to missing context${this.format({ childThreadId, count: queue.length })}`,
      );
      return;
    }

    for (const message of queue) {
      try {
        await this.forwardToParent(context, message, childThreadId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error?.(
          `ManageToolNode: failed to flush queued response${this.format({ childThreadId, parentThreadId: context.parentThreadId, error: errorMessage })}`,
        );
        throw err instanceof Error ? err : new Error(errorMessage);
      }
    }
  }

  private enqueueMessage(threadId: string, text: string): void {
    const queue = this.queuedMessages.get(threadId) ?? [];
    queue.push(text);
    this.queuedMessages.set(threadId, queue);
  }

  private dequeueMessage(threadId: string): string | undefined {
    const queue = this.queuedMessages.get(threadId);
    if (!queue || queue.length === 0) return undefined;
    const next = queue.shift();
    if (queue.length === 0) {
      this.queuedMessages.delete(threadId);
    }
    return next;
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }
}
