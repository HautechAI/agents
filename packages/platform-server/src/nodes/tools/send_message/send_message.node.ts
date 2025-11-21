import { Inject, Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendMessageFunctionTool } from './send_message.tool';
import { LoggerService } from '../../../core/services/logger.service';
import { SlackTrigger } from '../../slackTrigger/slackTrigger.node';

export const SendMessageToolStaticConfigSchema = z.object({}).strict();

type SendMessageConfig = Record<string, never>;

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<SendMessageConfig> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {
    super(logger);
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance) {
      let cachedTrigger: SlackTrigger | null = null;
      const resolveTrigger = async () => {
        if (cachedTrigger) return cachedTrigger;
        try {
          const resolved = await this.moduleRef.resolve<SlackTrigger>(SlackTrigger, undefined, { strict: false });
          cachedTrigger = resolved;
          return resolved;
        } catch (err) {
          this.logger.error('SendMessageNode failed to resolve SlackTrigger', err);
          return null;
        }
      };
      this.toolInstance = new SendMessageFunctionTool(this.logger, resolveTrigger);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
