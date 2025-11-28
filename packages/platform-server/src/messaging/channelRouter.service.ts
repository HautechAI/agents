import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../core/services/prisma.service';
import { ManageAdapter } from './manage/manage.adapter';
import { SlackAdapter } from './slack/slack.adapter';
import {
  ChannelDescriptorSchema,
  type IChannelAdapter,
  type ManageChannelDescriptor,
  type SendResult,
  type SlackChannelDescriptor,
  type ThreadOutboxSendRequest,
} from './types';

interface SlackRoute {
  type: 'slack';
  descriptor: SlackChannelDescriptor;
  channelNodeId: string;
}

interface ManageRoute {
  type: 'manage';
  descriptor: ManageChannelDescriptor;
}

type ThreadRoute = SlackRoute | ManageRoute;

interface AdapterWithRoute extends IChannelAdapter {
  route: ThreadRoute;
}

@Injectable()
export class ChannelRouter {
  private readonly logger = new Logger(ChannelRouter.name);

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(SlackAdapter) private readonly slackAdapter: SlackAdapter,
    @Inject(ManageAdapter) private readonly manageAdapter: ManageAdapter,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private async resolveRoute(threadId: string): Promise<ThreadRoute | null> {
    try {
      const prisma = this.prismaService.getClient();
      const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { channel: true, channelNodeId: true },
      });
      if (!thread?.channel) return null;

      const parsed = ChannelDescriptorSchema.safeParse(thread.channel);
      if (!parsed.success) {
        this.logger.warn(
          `ChannelRouter: invalid descriptor${this.format({ threadId, issues: parsed.error.issues })}`,
        );
        return null;
      }

      if (parsed.data.type === 'slack') {
        const channelNodeId = thread.channelNodeId;
        if (!channelNodeId) {
          this.logger.warn(
            `ChannelRouter: missing Slack channel node${this.format({ threadId })}`,
          );
          return null;
        }
        return { type: 'slack', descriptor: parsed.data, channelNodeId } satisfies SlackRoute;
      }

      if (parsed.data.type === 'manage') {
        return { type: 'manage', descriptor: parsed.data } satisfies ManageRoute;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `ChannelRouter: failed resolving route${this.format({
          threadId,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { error },
        })}`,
      );
      return null;
    }
  }

  async getAdapter(threadId: string): Promise<IChannelAdapter | null> {
    const route = await this.resolveRoute(threadId);
    if (!route) return null;

    if (route.type === 'slack') {
      const adapter: AdapterWithRoute = {
        route,
        sendText: async (payload: ThreadOutboxSendRequest): Promise<SendResult> => {
          return this.slackAdapter.sendText({ ...payload, channelNodeId: route.channelNodeId });
        },
      };
      return adapter;
    }

    if (route.type === 'manage') {
      const adapter: AdapterWithRoute = {
        route,
        sendText: async (payload: ThreadOutboxSendRequest): Promise<SendResult> => {
          const forwarded = await this.manageAdapter.forwardChildMessage({
            childThreadId: payload.threadId,
            text: payload.text,
            source: payload.source,
            runId: payload.runId ?? null,
            prefix: payload.prefix,
          });

          if (!forwarded.ok) {
            return { ok: false, error: forwarded.error } satisfies SendResult;
          }

          const parentAdapter = await this.getAdapter(forwarded.parentThreadId);
          if (!parentAdapter) {
            return { ok: false, error: 'missing_parent_channel' } satisfies SendResult;
          }

          const nextPayload: ThreadOutboxSendRequest = {
            threadId: forwarded.parentThreadId,
            text: forwarded.forwardedText,
            source: 'manage_forward',
            prefix: undefined,
            runId: payload.runId,
          };

          return parentAdapter.sendText(nextPayload);
        },
      };
      return adapter;
    }

    return null;
  }
}
