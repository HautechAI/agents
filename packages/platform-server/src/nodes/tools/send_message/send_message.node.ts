import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendMessageFunctionTool } from './send_message.tool';
import { LoggerService } from '../../../core/services/logger.service';
import { MessagingService } from '../../../messaging/messaging.service';

export const SendMessageToolStaticConfigSchema = z.object({}).strict();

type SendMessageConfig = Record<string, never>;

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<SendMessageConfig> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(MessagingService) private readonly messagingService: MessagingService,
  ) {
    super(logger);
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance) this.toolInstance = new SendMessageFunctionTool(this.logger, this.messagingService);
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
