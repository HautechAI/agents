import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AgentsPersistenceService } from '../../agents/agents.persistence.service';
import { AGENTS_PERSISTENCE_READER } from '../../agents/tokens';
import { PrismaService } from '../../core/services/prisma.service';
import {
  ManageChannelDescriptorSchema,
  type ThreadOutboxSource,
} from '../types';

interface ComputeForwardingInfoParams {
  childThreadId: string;
  text: string;
  source: ThreadOutboxSource;
  runId?: string | null;
  prefix?: string;
}

interface ComputeForwardingInfoSuccess {
  ok: true;
  parentThreadId: string;
  forwardedText: string;
  agentTitle: string;
  childThreadId: string;
  childThreadAlias?: string | null;
  runId: string | null;
  showCorrelationInOutput: boolean;
}

interface ComputeForwardingInfoFailure {
  ok: false;
  error: string;
}

@Injectable()
export class ManageAdapter {
  private readonly logger = new Logger(ManageAdapter.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AGENTS_PERSISTENCE_READER)
    private readonly persistence: Pick<AgentsPersistenceService, 'getThreadAgentTitle' | 'getThreadAgentNodeId'>,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private errorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  async computeForwardingInfo(params: ComputeForwardingInfoParams): Promise<ComputeForwardingInfoSuccess | ComputeForwardingInfoFailure> {
    const { childThreadId, source, runId = null } = params;
    const text = params.text?.trim() ?? '';
    if (!text) {
      return { ok: false, error: 'empty_message' };
    }

    try {
      const prisma = this.prisma.getClient();
      const thread = await prisma.thread.findUnique({
        where: { id: childThreadId },
        select: { parentId: true, alias: true, channel: true },
      });
      const parentThreadId = thread?.parentId ?? null;
      if (!parentThreadId) {
        this.logger.warn(
          `ManageAdapter: missing parent thread${this.format({ childThreadId })}`,
        );
        return { ok: false, error: 'manage_missing_parent' };
      }

      const agentTitleCandidate = await this.persistence.getThreadAgentTitle(childThreadId);
      const trimmedAgentTitle = typeof agentTitleCandidate === 'string' ? agentTitleCandidate.trim() : '';
      const agentTitle = trimmedAgentTitle.length > 0 ? trimmedAgentTitle : 'Subagent';
      const descriptorInfo = this.parseDescriptor(thread?.channel);
      const resolvedPrefix = this.resolvePrefix(
        typeof params.prefix === 'string' && params.prefix.length > 0 ? params.prefix : descriptorInfo?.asyncPrefix,
        agentTitle,
      );
      const alias = this.extractAlias(thread?.alias);
      const correlationLabel = descriptorInfo?.showCorrelationInOutput ? this.buildCorrelationLabel({ alias, childThreadId }) : null;
      const forwardedText = this.composeForwardedText(resolvedPrefix, correlationLabel, text);

      return {
        ok: true,
        parentThreadId,
        forwardedText,
        agentTitle,
        childThreadId,
        childThreadAlias: alias,
        runId,
        showCorrelationInOutput: descriptorInfo?.showCorrelationInOutput ?? false,
      } satisfies ComputeForwardingInfoSuccess;
    } catch (error) {
      this.logger.error(
        `ManageAdapter: computeForwardingInfo failed${this.format({
          childThreadId: params.childThreadId,
          source,
          runId,
          error: this.errorInfo(error),
        })}`,
      );
      const message = error instanceof Error && error.message ? error.message : 'manage_forward_failed';
      return { ok: false, error: message };
    }
  }

  private parseDescriptor(raw: unknown): { asyncPrefix?: string; showCorrelationInOutput?: boolean } | null {
    if (!raw) return null;
    const parsed = ManageChannelDescriptorSchema.safeParse(raw);
    if (!parsed.success) return null;
    const meta = parsed.data.meta ?? {};
    return {
      asyncPrefix: typeof meta.asyncPrefix === 'string' ? meta.asyncPrefix : undefined,
      showCorrelationInOutput: meta.showCorrelationInOutput === true,
    };
  }

  private resolvePrefix(raw: string | undefined, agentTitle: string): string {
    const base = typeof raw === 'string' && raw.length > 0 ? raw : `From ${agentTitle}: `;
    return base.replace(/{{\s*agentTitle\s*}}/gi, agentTitle);
  }

  private extractAlias(alias: unknown): string | null {
    if (typeof alias !== 'string' || alias.length === 0) return null;
    const lastSegment = alias.split(':').pop();
    return (lastSegment ?? alias) || null;
  }

  private buildCorrelationLabel(context: { alias: string | null; childThreadId: string }): string {
    const parts: string[] = [];
    if (context.alias) parts.push(`alias=${context.alias}`);
    parts.push(`thread=${context.childThreadId}`);
    return `[${parts.join('; ')}]`;
  }

  private composeForwardedText(prefix: string, correlation: string | null, text: string): string {
    const correlationSegment = correlation ? `${correlation} ` : '';
    if (!prefix) return `${correlationSegment}${text}`.trimStart();
    return `${prefix}${correlationSegment}${text}`;
  }
}
