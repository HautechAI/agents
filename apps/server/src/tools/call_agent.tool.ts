import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';
import { BaseAgent } from '../agents/base.agent';
import { TriggerMessage } from '../triggers/base.trigger';
import { BaseMessage } from '@langchain/core/messages';

const invocationSchema = z.object({
  input: z.string().min(1).describe('The message to forward to the target agent.'),
  context: z
    .any()
    .optional()
    .describe('Optional structured metadata; forwarded into TriggerMessage.info'),
  childThreadId: z
    .string()
    .min(1)
    .describe(
      'Required child thread identifier used to maintain a persistent conversation with the child agent. Use the same value to continue the same conversation across multiple calls; use a new value to start a separate conversation. The effective child thread is computed as `${parentThreadId}__${childThreadId}`.',
    ),
});

export const CallAgentToolStaticConfigSchema = z.object({
  description: z.string().min(1).optional(), // TODO: make description non optional
  name: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/)
    .optional()
    .describe('Optional tool name (a-z, 0-9, underscore). Default: call_agent'),
  response: z
    .enum(['sync', 'async', 'ignore'])
    .optional()
    .default('sync')
    .describe('Response mode: sync (await child response), async (return immediately and callback), ignore (fire-and-forget)'),
});

type WithThreadId = LangGraphRunnableConfig & { 
  configurable?: { 
    thread_id?: string;
    caller_agent?: BaseAgent;
  } 
};

export class CallAgentTool extends BaseTool {
  private description = 'Call another agent with a message and optional context.';
  private name: string | undefined;
  private targetAgent: BaseAgent | undefined;
  private response: 'sync' | 'async' | 'ignore' = 'sync';

  constructor(private logger: LoggerService) {
    super();
  }

  setAgent(agent: BaseAgent | undefined): void {
    this.targetAgent = agent;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
  const parsed = CallAgentToolStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) {
      throw new Error('Invalid CallAgentTool config');
    }
    this.description = parsed.data.description ?? this.description;
    this.name = parsed.data.name ?? this.name;
    this.response = parsed.data.response;
  }

  init(config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return tool(
      async (raw, runtimeCfg) => {
        const parsed = invocationSchema.parse(raw);
        const hasContext = !!parsed.context;
        this.logger.info('call_agent invoked', { targetAttached: !!this.targetAgent, hasContext });

        if (!this.targetAgent) return 'Target agent is not connected';

        const parentThreadId =
          (runtimeCfg as WithThreadId | undefined)?.configurable?.thread_id ??
          (config as WithThreadId | undefined)?.configurable?.thread_id;
        if (!parentThreadId) {
          throw new Error('thread_id is required');
        }

        const targetThreadId = `${parentThreadId}__${parsed.childThreadId}`;

        const info =
          parsed.context && typeof parsed.context === 'object' && !Array.isArray(parsed.context)
            ? (parsed.context as Record<string, unknown>)
            : {};
        const triggerMessage: TriggerMessage = {
          content: parsed.input,
          info,
        };

        try {
          // Handle different response modes
          if (this.response === 'ignore') {
            // Fire-and-forget: invoke child but don't wait for response
            this.targetAgent.invoke(targetThreadId, [triggerMessage]).catch((err: any) => {
              this.logger.error('Error in ignore mode call_agent', err?.message || err, err?.stack);
            });
            return 'Message sent (ignore mode)';
          } else if (this.response === 'async') {
            // Async: return immediately, callback when child completes
            const callerAgent = (runtimeCfg as WithThreadId | undefined)?.configurable?.caller_agent ??
                               (config as WithThreadId | undefined)?.configurable?.caller_agent;
            
            if (!callerAgent) {
              // Fallback to sync mode if no caller agent available
              this.logger.info('No caller_agent in config for async mode, falling back to sync');
              const res: BaseMessage | undefined = await this.targetAgent.invoke(targetThreadId, [triggerMessage]);
              if (!res) return '';
              return res.text ?? '';
            }

            // Start async child invocation
            this.targetAgent.invoke(targetThreadId, [triggerMessage])
              .then((res: BaseMessage | undefined) => {
                if (res) {
                  // Trigger callback to parent agent with child response
                  const callbackMessage: TriggerMessage = {
                    content: `${parentThreadId}__${parsed.childThreadId}`,
                    info: { 
                      childResponse: res.text ?? '',
                      originalChildThreadId: parsed.childThreadId,
                      type: 'async_callback'
                    }
                  };
                  callerAgent.invoke(parentThreadId, [callbackMessage]).catch((err: any) => {
                    this.logger.error('Error in async callback to parent agent', err?.message || err, err?.stack);
                  });
                }
              })
              .catch((err: any) => {
                this.logger.error('Error in async call_agent', err?.message || err, err?.stack);
                // Send error callback to parent
                const errorMessage: TriggerMessage = {
                  content: `${parentThreadId}__${parsed.childThreadId}`,
                  info: {
                    error: err?.message || String(err),
                    originalChildThreadId: parsed.childThreadId,
                    type: 'async_callback'
                  }
                };
                callerAgent.invoke(parentThreadId, [errorMessage]).catch((callbackErr: any) => {
                  this.logger.error('Error in async error callback', callbackErr?.message || callbackErr, callbackErr?.stack);
                });
              });

            return { status: 'sent' };
          } else {
            // Sync mode (default): await child response
            const res: BaseMessage | undefined = await this.targetAgent.invoke(targetThreadId, [triggerMessage]);
            if (!res) return '';
            return res.text ?? '';
          }
        } catch (err: any) {
          this.logger.error('Error calling agent', err?.message || err, err?.stack);
          return `Error calling agent: ${err?.message || String(err)}`;
        }
      },
      {
        name: this.name || 'call_agent',
        description: this.description,
        schema: invocationSchema,
      },
    );
  }
}
