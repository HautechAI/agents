import { Inject, Injectable, Logger } from '@nestjs/common';
import { LiveGraphRuntime } from '../../graph-core/liveGraph.manager';
import { SlackTrigger } from '../../nodes/slackTrigger/slackTrigger.node';
import type { SendResult, ThreadOutboxSendRequest } from '../types';

@Injectable()
export class SlackAdapter {
  private readonly logger = new Logger(SlackAdapter.name);

  constructor(@Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  async sendText(payload: ThreadOutboxSendRequest & { channelNodeId: string }): Promise<SendResult> {
    const { channelNodeId, threadId, source } = payload;
    const text = payload.prefix ? `${payload.prefix}${payload.text}` : payload.text;

    const node = this.runtime.getNodeInstance(channelNodeId);
    if (!node) {
      this.logger.warn(
        `SlackAdapter: missing SlackTrigger node${this.format({ channelNodeId, threadId, source })}`,
      );
      return { ok: false, error: 'channel_node_unavailable' } satisfies SendResult;
    }

    if (!(node instanceof SlackTrigger)) {
      this.logger.warn(
        `SlackAdapter: node is not SlackTrigger${this.format({ channelNodeId, threadId, source })}`,
      );
      return { ok: false, error: 'invalid_channel_node' } satisfies SendResult;
    }

    if (node.status !== 'ready') {
      this.logger.warn(
        `SlackAdapter: trigger not ready${this.format({ channelNodeId, threadId, source, status: node.status })}`,
      );
      return { ok: false, error: 'slacktrigger_not_ready' } satisfies SendResult;
    }

    return node.sendToChannel(threadId, text);
  }
}
