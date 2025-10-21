import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../services/logger.service';
import { RemindMeFunctionTool, RemindMeToolStaticConfigSchema } from './remind_me.tool';
import z from 'zod';
import { BaseAgent } from '../../agent/agent.node';

export class RemindMeNode extends BaseToolNode {
  private toolInstance?: RemindMeFunctionTool;
  private callerAgent?: BaseAgent; // set via port wiring
  private staticCfg: z.infer<typeof RemindMeToolStaticConfigSchema> = {};
  constructor(private logger: LoggerService) { super(); }
  setCallerAgent(agent: BaseAgent | undefined) { this.callerAgent = agent; }
  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = RemindMeToolStaticConfigSchema.safeParse(cfg || {});
    if (!parsed.success) throw new Error('Invalid RemindMe config');
    this.staticCfg = parsed.data;
    this.toolInstance = undefined;
  }
  getTool(): RemindMeFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new RemindMeFunctionTool({
        getCallerAgent: () => this.callerAgent,
        logger: this.logger,
      });
    }
    return this.toolInstance;
  }
}

export { RemindMeNode as RemindMeTool };
export { RemindMeToolStaticConfigSchema };