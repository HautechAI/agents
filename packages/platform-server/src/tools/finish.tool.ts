import { z } from 'zod';
import { BaseTool } from './base.tool';
import { TerminateResponse } from './terminateResponse';
import { LoggerService } from '../services/logger.service';

const finishSchema = z.object({ note: z.string().optional() });

export class FinishTool extends BaseTool {
  constructor(logger: LoggerService) { super(logger); }
  name(): string { return 'finish'; }
  description(): string { return 'Signal end of tool sequence for now; agent waits for future input.'; }
  inputSchema() { return finishSchema; }
  async invoke(raw: unknown): Promise<unknown> { const { note } = finishSchema.parse(raw); return new TerminateResponse(note); }
}

export const FinishToolStaticConfigSchema = z.object({}).strict();
