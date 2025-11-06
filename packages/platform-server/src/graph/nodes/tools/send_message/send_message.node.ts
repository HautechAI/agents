import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../../core/services/logger.service';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { SendMessageFunctionTool, SendMessageInvocationSchema } from './send_message.tool';

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<z.infer<typeof SendMessageInvocationSchema>> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(@Inject(LoggerService) protected logger: LoggerService, @Inject(SendMessageFunctionTool) private readonly tool: SendMessageFunctionTool) {
    super(logger);
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = this.tool;
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}

