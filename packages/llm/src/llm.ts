import OpenAI from 'openai';
import type { Response } from 'openai/resources/responses/responses.mjs';

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
  ResponseMessage,
} from './messages';
import { FunctionTool } from './functionTool';

export class ReasoningOnlyZeroUsageError extends Error {
  readonly rawResponse: Response;

  constructor(rawResponse: Response) {
    super('Received reasoning-only response with zero usage tokens');
    this.name = 'ReasoningOnlyZeroUsageError';
    this.rawResponse = rawResponse;
  }
}

export type LLMInput =
  | HumanMessage
  | AIMessage
  | ToolCallMessage
  | ToolCallOutputMessage
  | SystemMessage
  | ResponseMessage;

export class LLM {
  constructor(private openAI: OpenAI) {}

  async call(params: { model: string; input: Array<LLMInput>; tools?: Array<FunctionTool> }) {
    const flattenInput = params.input
      .map((m) => {
        if (m instanceof ResponseMessage) {
          return m.output //
            .map((o) => o.toPlain());
        }
        return m.toPlain();
      })
      .flat();

    const toolDefinitions = params.tools?.map((tool) => tool.definition());

    const response = await this.openAI.responses.create({
      model: params.model,
      input: flattenInput,
      tools: toolDefinitions,
    });

    if (LLM.isReasoningOnlyZeroUsage(response)) {
      throw new ReasoningOnlyZeroUsageError(response);
    }

    return new ResponseMessage(response);
  }

  private static isReasoningOnlyZeroUsage(response: Response): boolean {
    return LLM.hasZeroUsage(response.usage) && LLM.outputIsReasoningOnly(response.output);
  }

  private static hasZeroUsage(usage: Response['usage'] | null | undefined): boolean {
    if (!usage || typeof usage !== 'object') return false;

    const counts: number[] = [];
    const record = usage as Record<string, unknown>;

    for (const key of ['total_tokens', 'input_tokens', 'output_tokens']) {
      const value = record[key];
      if (typeof value === 'number') counts.push(value);
    }

    const inputDetails = record.input_tokens_details;
    if (inputDetails && typeof inputDetails === 'object') {
      const cached = (inputDetails as Record<string, unknown>).cached_tokens;
      if (typeof cached === 'number') counts.push(cached);
    }

    const outputDetails = record.output_tokens_details;
    if (outputDetails && typeof outputDetails === 'object') {
      const reasoning = (outputDetails as Record<string, unknown>).reasoning_tokens;
      if (typeof reasoning === 'number') counts.push(reasoning);
    }

    if (!counts.length) return false;
    return counts.every((value) => value === 0);
  }

  private static outputIsReasoningOnly(output: Response['output'] | null | undefined): boolean {
    if (!Array.isArray(output) || output.length === 0) return false;
    return output.every((item) => item?.type === 'reasoning');
  }
}
