import z from 'zod';

import { FunctionTool, HumanMessage, ResponseMessage, ToolCallOutputMessage } from '@agyn/llm';
import { ManageToolNode, type ManageWorkerMetadata } from './manage.node';
import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { LLMContext } from '../../../llm/types';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import type { AgentNode } from '../../agent/agent.node';
import type { ErrorResponse } from '../../../utils/error-response';
import { normalizeError } from '../../../utils/error-response';

export const ManageInvocationSchema = z
  .object({
    command: z.enum(['send_message', 'check_status']).describe('Command to execute.'),
    worker: z.string().min(1).optional().describe('Target worker name (required for send_message).'),
    message: z.string().min(1).optional().describe('Message to send (required for send_message).'),
    threadAlias: z
      .string()
      .min(1)
      .optional()
      .describe('Optional child thread alias; defaults per worker title.'),
  })
  .strict();

type ManageInvocationArgs = z.infer<typeof ManageInvocationSchema>;
type ManageInvocationSuccess = string;
type InvocationOutcome = ResponseMessage | ToolCallOutputMessage;
type InvocationResult = PromiseLike<InvocationOutcome> | InvocationOutcome;
type WorkerMatchType = 'name' | 'name+role' | 'legacy';
type WorkerTarget = { agent: AgentNode; metadata: ManageWorkerMetadata; matchType: WorkerMatchType };

@Injectable({ scope: Scope.TRANSIENT })
export class ManageFunctionTool extends FunctionTool<typeof ManageInvocationSchema> {
  private _node?: ManageToolNode;
  private persistence?: AgentsPersistenceService;
  private readonly logger = new Logger(ManageFunctionTool.name);
  private static legacyLookupWarningEmitted = false;

  constructor(
    @Inject(AgentsPersistenceService) private readonly injectedPersistence: AgentsPersistenceService,
  ) {
    super();
  }

  init(node: ManageToolNode, options?: { persistence?: AgentsPersistenceService }) {
    this._node = node;
    this.persistence = options?.persistence ?? this.injectedPersistence;
    return this;
  }

  get node() {
    if (!this._node) throw new Error('ManageFunctionTool: node not initialized');
    return this._node;
  }

  get name() {
    return this.node.config.name ?? 'manage';
  }
  get schema() {
    return ManageInvocationSchema;
  }
  get description() {
    return this.node.config.description ?? 'Manage tool';
  }

  private getPersistence(): AgentsPersistenceService | undefined {
    return this.persistence ?? this.injectedPersistence;
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private sanitizeAlias(raw: string | undefined): string {
    const normalized = (raw ?? '').toLowerCase();
    const withHyphen = normalized.replace(/\s+/g, '-');
    const cleaned = withHyphen.replace(/[^a-z0-9._-]/g, '');
    const collapsed = cleaned.replace(/-+/g, '-');
    const truncated = collapsed.slice(0, 64);
    if (!truncated || !/[a-z0-9]/.test(truncated)) {
      throw new Error('Manage: invalid or empty threadAlias');
    }
    return truncated;
  }

  private normalize(err: unknown, options?: { defaultCode?: string; retriable?: boolean }): ErrorResponse {
    return normalizeError(err, options);
  }

  private isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      return false;
    }
    return typeof (value as PromiseLike<T>).then === 'function';
  }

  private toInvocationPromise(result: InvocationResult): { promise: Promise<InvocationOutcome>; isPromise: boolean } {
    const isPromise = this.isPromiseLike<InvocationOutcome>(result);
    const promise = Promise.resolve(result as InvocationOutcome);
    return { promise, isPromise };
  }

  private logError(prefix: string, context: Record<string, unknown>, err: unknown) {
    const normalized = this.normalize(err);
    this.logger.error(`${prefix}${this.format({ ...context, error: normalized })}`);
  }

  private normalizeLookup(value: string): string {
    return value.trim().normalize('NFKC').toLowerCase();
  }

  private parseWorkerHandle(handle: string): { name: string; role?: string } {
    const trimmed = handle.trim();
    if (!trimmed) return { name: '' };
    const match = trimmed.match(/^(.*)\(([^()]+)\)$/);
    if (!match) return { name: trimmed };
    const name = match[1].trim();
    const role = match[2].trim();
    if (!name || !role) return { name: trimmed };
    return { name, role };
  }

  private emitLegacyLookupWarning(provided: string, metadata: ManageWorkerMetadata): void {
    if (ManageFunctionTool.legacyLookupWarningEmitted) return;
    ManageFunctionTool.legacyLookupWarningEmitted = true;
    this.logger.warn(
      `Manage: worker lookup matched legacy label${this.format({
        provided,
        workerName: metadata.name,
        workerLabel: metadata.displayLabel,
      })}`,
    );
  }

  private getWorkerTarget(handle: string): WorkerTarget {
    const parsed = this.parseWorkerHandle(handle);
    if (!parsed.name) throw new Error(`Unknown worker: ${handle}`);

    const matchesByName = this.node.getWorkersByName(parsed.name);
    if (matchesByName.length > 1) {
      if (!parsed.role) {
        const roles = matchesByName
          .map((candidate) => this.node.getWorkerMetadata(candidate).role ?? '(unspecified)')
          .filter((value, index, self) => self.indexOf(value) === index);
        throw new Error(
          `Multiple workers share the name "${parsed.name}". Include the role to disambiguate. Available roles: ${roles.join(
            ', ',
          )}`,
        );
      }
      const resolved = this.node.findWorkerByNameAndRole(parsed.name, parsed.role);
      if (!resolved) throw new Error(`Unknown worker: ${handle}`);
      const metadata = this.node.getWorkerMetadata(resolved);
      return { agent: resolved, metadata, matchType: 'name+role' };
    }

    if (matchesByName.length === 1) {
      const agent = matchesByName[0];
      const metadata = this.node.getWorkerMetadata(agent);
      if (parsed.role) {
        const providedRole = this.normalizeLookup(parsed.role);
        const workerRole = metadata.role ? this.normalizeLookup(metadata.role) : '';
        if (workerRole && workerRole !== providedRole) {
          // Provided role does not match. Fall back to lookups below.
        } else {
          return { agent, metadata, matchType: workerRole ? 'name+role' : 'name' };
        }
      } else {
        return { agent, metadata, matchType: 'name' };
      }
    }

    if (parsed.role) {
      const resolved = this.node.findWorkerByNameAndRole(parsed.name, parsed.role);
      if (resolved) {
        const metadata = this.node.getWorkerMetadata(resolved);
        return { agent: resolved, metadata, matchType: 'name+role' };
      }
    }

    const legacy = this.node.findWorkerByLegacyLabel(handle);
    if (legacy) {
      const metadata = this.node.getWorkerMetadata(legacy);
      return { agent: legacy, metadata, matchType: 'legacy' };
    }

    throw new Error(`Unknown worker: ${handle}`);
  }

  async execute(args: ManageInvocationArgs, ctx: LLMContext): Promise<ManageInvocationSuccess> {
    const { command, worker, message, threadAlias } = args;
    const parentThreadId = ctx.threadId;
    if (!parentThreadId) throw new Error('Manage: missing threadId in LLM context');
    const workerLabels = this.node.listWorkers();
    if (command === 'send_message') {
      if (!workerLabels.length) throw new Error('No agents connected');
      const workerHandle = worker?.trim();
      if (!workerHandle) throw new Error('worker is required for send_message');
      const messageText = message?.trim() ?? '';
      if (!messageText) throw new Error('message is required for send_message');
      const { agent: targetAgent, metadata, matchType } = this.getWorkerTarget(workerHandle);
      if (matchType === 'legacy') {
        this.emitLegacyLookupWarning(workerHandle, metadata);
      }
      const persistence = this.getPersistence();
      if (!persistence) throw new Error('Manage: persistence unavailable');
      const callerAgent = ctx.callerAgent;
      if (!callerAgent || typeof callerAgent.invoke !== 'function') {
        throw new Error('Manage: caller agent unavailable');
      }
      const providedAlias = typeof threadAlias === 'string' ? threadAlias.trim() : undefined;
      if (typeof threadAlias === 'string' && !providedAlias) {
        throw new Error('Manage: invalid or empty threadAlias');
      }
      let aliasUsed = providedAlias ?? this.sanitizeAlias(metadata.name);
      const fallbackAlias =
        providedAlias !== undefined
          ? (() => {
              try {
                return this.sanitizeAlias(providedAlias);
              } catch {
                return null;
              }
            })()
          : null;
      let childThreadId: string | undefined;
      try {
        childThreadId = await persistence.getOrCreateSubthreadByAlias('manage', aliasUsed, parentThreadId, '');
      } catch (primaryError) {
        if (fallbackAlias && fallbackAlias !== aliasUsed) {
          aliasUsed = fallbackAlias;
          childThreadId = await persistence.getOrCreateSubthreadByAlias('manage', aliasUsed, parentThreadId, '');
          this.logger.warn(
            `Manage: provided threadAlias invalid, using sanitized fallback${this.format({
              workerName: metadata.name,
              workerLabel: metadata.displayLabel,
              parentThreadId,
              providedAlias,
              fallbackAlias: aliasUsed,
            })}`,
          );
        } else {
          throw primaryError;
        }
      }
      if (!childThreadId) {
        throw new Error('Manage: failed to create child thread');
      }
      await persistence.setThreadChannelNode(childThreadId, this.node.nodeId);
      const mode = this.node.getMode();
      const timeoutMs = this.node.getTimeoutMs();
      let waitPromise: Promise<string> | null = null;
      try {
        await this.node.registerInvocation({
          childThreadId,
          parentThreadId,
          workerTitle: metadata.displayLabel,
          callerAgent,
        });
        if (mode === 'sync') {
          waitPromise = this.node.awaitChildResponse(childThreadId, timeoutMs);
        }
        const invocationResult: InvocationResult = targetAgent.invoke(childThreadId, [HumanMessage.fromText(messageText)]);
        const { promise: invocationPromise, isPromise } = this.toInvocationPromise(invocationResult);

        if (mode === 'sync') {
          const [responseText] = await Promise.all([waitPromise!, invocationPromise]);
          return this.node.renderWorkerResponse(metadata.displayLabel, responseText);
        }

        if (!isPromise) {
          const resultType = invocationResult === null ? 'null' : typeof invocationResult;
          this.logger.error(
            `Manage: async send_message invoke returned non-promise${this.format({
              workerName: metadata.name,
              workerLabel: metadata.displayLabel,
              childThreadId,
              resultType,
              promiseLike: isPromise,
            })}`,
          );
        }

        invocationPromise.catch((err) => {
          this.logError('Manage: async send_message failed', { workerName: metadata.name, workerLabel: metadata.displayLabel, childThreadId, matchType }, err);
        });

        return this.node.renderAsyncAcknowledgement(metadata.displayLabel);
      } catch (err: unknown) {
        this.logError('Manage: send_message failed', { workerName: metadata.name, workerLabel: metadata.displayLabel, childThreadId, matchType }, err);
        throw err;
      }
    }
    if (command === 'check_status') {
      const workers = this.node.getWorkers();
      if (!workers.length) return JSON.stringify({ activeTasks: 0, childThreadIds: [] });
      const _prefix = `${parentThreadId}__`;
      const ids = new Set<string>();
      const promises = workers.map(async (_agent) => {
        try {
          // const res = await Promise.resolve(w.agent.listActiveThreads(prefix));
          // const threads = Array.isArray(res) ? res : [];
          // for (const t of threads) if (t.startsWith(prefix)) ids.add(t.slice(prefix.length));
        } catch (_err: unknown) {
          // this.logger.error('Manage: listActiveThreads failed', {
          //   worker: w.name,
          //   error: (err as { message?: string })?.message || String(err),
          // });
        }
      });
      await Promise.all(promises);
      return JSON.stringify({ activeTasks: ids.size, childThreadIds: Array.from(ids.values()) });
    }
    return '';
  }
}
