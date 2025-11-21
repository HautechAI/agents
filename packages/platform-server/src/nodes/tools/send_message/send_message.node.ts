import { Inject, Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendMessageFunctionTool } from './send_message.tool';
import { LoggerService } from '../../../core/services/logger.service';
import { SlackTrigger } from '../../slackTrigger/slackTrigger.node';
import { LiveGraphRuntime } from '../../../graph/liveGraph.manager';

export const SendMessageToolStaticConfigSchema = z.object({}).strict();

type SendMessageConfig = Record<string, never>;

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<SendMessageConfig> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
  ) {
    super(logger);
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance) {
      let cachedTrigger: SlackTrigger | null = null;
      const resolveTrigger = async (): Promise<SlackTrigger | null> => {
        if (cachedTrigger && cachedTrigger.status === 'ready') return cachedTrigger;
        if (cachedTrigger && cachedTrigger.status !== 'ready') cachedTrigger = null;

        const liveNodes = this.runtime.getNodes();
        for (const node of liveNodes) {
          if (node.template !== 'slackTrigger') continue;
          if (node.instance instanceof SlackTrigger && node.instance.status === 'ready') {
            cachedTrigger = node.instance;
            return cachedTrigger;
          }
        }

        try {
          const resolved = await this.moduleRef.resolve<SlackTrigger>(SlackTrigger, undefined, { strict: false });
          if (resolved.status === 'ready') {
            cachedTrigger = resolved;
            return resolved;
          }
          this.logger.warn('SendMessageNode resolved SlackTrigger that is not ready', {
            status: resolved.status,
          });
        } catch (err) {
          this.logger.error('SendMessageNode failed to resolve SlackTrigger', err);
        }
        return null;
      };
      this.toolInstance = new SendMessageFunctionTool(this.logger, resolveTrigger);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
