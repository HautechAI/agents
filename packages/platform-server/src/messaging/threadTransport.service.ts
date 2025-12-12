import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../core/services/prisma.service';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import type { SendResult } from './types';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';

export type TransportSendOptions = {
  runId?: string | null;
  source?: string | null;
};

export interface ThreadChannelNode {
  sendToChannel(threadId: string, text: string): Promise<SendResult>;
}

export const isThreadChannelNode = (candidate: unknown): candidate is ThreadChannelNode => {
  return typeof (candidate as ThreadChannelNode | null)?.sendToChannel === 'function';
};

@Injectable()
export class ThreadTransportService {
  private readonly logger = new Logger(ThreadTransportService.name);

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {}

  async sendTextToThread(threadId: string, text: string, options?: TransportSendOptions): Promise<SendResult> {
    const normalizedThreadId = threadId?.trim();
    if (!normalizedThreadId) {
      return { ok: false, error: 'missing_thread_id' };
    }
    if (text.trim().length === 0) {
      return { ok: false, error: 'empty_message' };
    }

    const prisma = this.prismaService.getClient();
    const thread = await prisma.thread.findUnique({ where: { id: normalizedThreadId }, select: { id: true, channelNodeId: true } });
    if (!thread) {
      return { ok: false, error: 'missing_thread' };
    }

    const channelNodeId = thread.channelNodeId ?? null;
    const runId = options?.runId ?? null;
    const source = options?.source ?? null;

    if (!channelNodeId) {
      try {
        await this.persistence.recordTransportAssistantMessage({
          threadId: normalizedThreadId,
          text,
          runId,
          source,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `ThreadTransportService: failed to persist assistant message${this.format({ threadId: normalizedThreadId, channelNodeId: null, error: message })}`,
        );
        return { ok: false, error: 'persist_failed', threadId: normalizedThreadId };
      }

      return { ok: true, threadId: normalizedThreadId };
    }

    const node = this.runtime.getNodeInstance(channelNodeId);
    if (!node) {
      this.logger.error(
        `ThreadTransportService: channel node unavailable${this.format({ threadId: normalizedThreadId, channelNodeId })}`,
      );
      return { ok: false, error: 'channel_node_unavailable' };
    }

    if (!isThreadChannelNode(node)) {
      this.logger.error(
        `ThreadTransportService: unsupported channel node${this.format({ threadId: normalizedThreadId, channelNodeId })}`,
      );
      return { ok: false, error: 'unsupported_channel_node' };
    }

    try {
      const result = await node.sendToChannel(normalizedThreadId, text);
      if (!result.ok) {
        return result;
      }

      const skipPersistence = await this.shouldSkipAutoResponsePersistence({
        node,
        text,
        threadId: normalizedThreadId,
        channelNodeId,
        runId,
        source,
      });
      if (skipPersistence) {
        return result;
      }

      try {
        await this.persistence.recordTransportAssistantMessage({
          threadId: normalizedThreadId,
          text,
          runId,
          source,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `ThreadTransportService: failed to persist assistant message${this.format({ threadId: normalizedThreadId, channelNodeId, error: message })}`,
        );
        return { ok: false, error: 'persist_failed', threadId: normalizedThreadId };
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `ThreadTransportService: sendToChannel failed${this.format({ threadId: normalizedThreadId, channelNodeId, error: message })}`,
      );
      return { ok: false, error: message };
    }
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private async shouldSkipAutoResponsePersistence(params: {
    node: ThreadChannelNode;
    text: string;
    threadId: string;
    channelNodeId: string;
    runId: string | null;
    source: string | null;
  }): Promise<boolean> {
    const getMode = (params.node as { getMode?: () => unknown }).getMode;
    if (typeof getMode !== 'function') return false;

    let mode: unknown;
    try {
      mode = getMode.call(params.node);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `ThreadTransportService: failed to read channel mode${this.format({ threadId: params.threadId, channelNodeId: params.channelNodeId, error: message })}`,
      );
      return false;
    }

    if (mode !== 'sync') return false;

    if (params.source !== 'auto_response') return false;
    const trimmedRunId = params.runId?.trim();
    if (!trimmedRunId) return false;

    try {
      const lastOutput = await this.persistence.getLastRunAssistantOutput(trimmedRunId, params.threadId);
      return lastOutput !== null && lastOutput === params.text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `ThreadTransportService: dedup lookup failed${this.format({ threadId: params.threadId, channelNodeId: params.channelNodeId, runId: trimmedRunId, error: message })}`,
      );
      return false;
    }
  }
}
