import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import { AgentNode } from '../../agent/agent.node';
import { LoggerService } from '../../../core/services/logger.service';

export const ManageToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name. Default: Manage'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class ManageToolNode extends BaseToolNode<z.infer<typeof ManageToolStaticConfigSchema>> {
  private tool?: ManageFunctionTool;
  private readonly workers = new Set<AgentNode>();

  constructor(
    @Inject(ManageFunctionTool) private readonly manageTool: ManageFunctionTool,
    @Inject(LoggerService) protected logger: LoggerService,
  ) {
    super(logger);
  }

  addWorker(agent: AgentNode) {
    if (!agent) throw new Error('ManageTool: agent instance is required');
    if (this.workers.has(agent)) throw new Error('ManageTool: agent already registered');
    const title = this.getAgentTitle(agent);
    for (const existing of this.workers) {
      const existingTitle = this.getAgentTitle(existing);
      if (existingTitle === title) {
        throw new Error(`ManageTool: worker with title ${title} already exists`);
      }
    }
    this.workers.add(agent);
  }

  removeWorker(agent: AgentNode) {
    if (!agent) return;
    this.workers.delete(agent);
  }

  listWorkers() {
    return Array.from(this.workers).map((agent) => this.getAgentTitle(agent));
  }

  getWorkers() {
    return Array.from(this.workers);
  }

  getWorkerByTitle(title: string) {
    const trimmed = title?.trim();
    if (!trimmed) return undefined;
    for (const agent of this.workers) {
      if (this.getAgentTitle(agent) === trimmed) return agent;
    }
    return undefined;
  }

  private getAgentTitle(agent: AgentNode): string {
    let rawTitle: unknown;
    try {
      rawTitle = agent.config?.title;
    } catch (_err) {
      throw new Error('ManageTool: agent configuration not set');
    }
    if (typeof rawTitle !== 'string') throw new Error('ManageTool: agent title is required');
    const title = rawTitle.trim();
    if (!title) throw new Error('ManageTool: agent title is required');
    return title;
  }

  protected createTool() {
    return this.manageTool.init(this);
  }

  getTool() {
    if (!this.tool) this.tool = this.createTool();
    return this.tool;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' } },
      sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } },
    } as const;
  }
}
