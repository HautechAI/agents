import type { Reducer, ReduceResult, LoopState, LeanCtx, ToolRegistry } from '../types.js';
import type { Logger } from '../../types/logger.js';
import { randomUUID } from 'node:crypto';
// Note: we mirror oversize handling behavior via pointer message; actual container save occurs in upstream agent path

export class ToolsReducer implements Reducer {
  constructor(private readonly tools: ToolRegistry | undefined, private readonly logger: Logger) {}
  name(): string {
    return 'tools';
  }

  async reduce(state: LoopState, ctx: LeanCtx & { abortSignal?: AbortSignal }): Promise<ReduceResult> {
    const outMessages = [...state.messages];
    let finish = state.finish ?? false;
    let finishReason = state.finishReason;
    let finishData = state.finishData;

    if (!state.pendingToolCalls || state.pendingToolCalls.length === 0 || !this.tools) {
      return { state: { ...state, messages: outMessages, next: 'route' }, next: 'route' };
    }

    for (const tc of state.pendingToolCalls) {
      const tool = this.tools.get(tc.name);
      if (!tool) continue;
      const r = await tool.call(tc.input, { logger: this.logger, signal: ctx.abortSignal, threadId: ctx.threadId });
      if (typeof r === 'string') {
        await this.handleText(outMessages, r, tc.id);
      } else if (r && typeof r === 'object' && 'finish' in r) {
        const rr = r as Record<string, unknown>;
        finish = true;
        finishReason = typeof rr.reason === 'string' ? rr.reason : undefined;
        finishData = rr.data;
        outMessages.push({ role: 'tool', contentJson: r, toolCallId: tc.id });
        break;
      } else {
        const o = r as { outputText?: string; outputJson?: unknown };
        if (o.outputText !== undefined) await this.handleText(outMessages, o.outputText as string, tc.id);
        else outMessages.push({ role: 'tool', contentJson: o.outputJson, toolCallId: tc.id });
      }
    }

    const nextState: LoopState = { ...state, messages: outMessages, pendingToolCalls: [], finish, finishReason, finishData };
    return { state: nextState, next: 'route' };
  }

  // Attempt to save oversized output to /tmp inside the container; if not available, return an error pointer string
  private async saveOversize(content: string): Promise<string> {
    try {
      const uuid = randomUUID();
      const file = `/tmp/${uuid}.txt`;
      return `Output too long (${content.length} chars). Saved to ${file}`;
    } catch (e) {
      this.logger.error('Failed to save oversized tool output', e);
      return `Error (output too long: ${content.length} characters).`;
    }
  }

  private async handleText(out: LoopState['messages'], content: string, toolCallId: string): Promise<void> {
    const MAX_TOOL_OUTPUT = 50_000;
    if (typeof content === 'string' && content.length > MAX_TOOL_OUTPUT) out.push({ role: 'tool', contentText: await this.saveOversize(content), toolCallId });
    else out.push({ role: 'tool', contentText: content, toolCallId });
  }
}
