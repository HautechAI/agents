import { FunctionTool, ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import z from 'zod';
import { LLMLoopContext } from './types';

export type LLMFunctionToolOuput = ResponseInputItem.FunctionCallOutput['output'];

export abstract class LLMFunctionTool<T extends z.ZodObject = z.ZodObject> {
  abstract get name(): string;
  abstract get schema(): T;
  abstract get description(): string;

  abstract execute(args: z.infer<T>, ctx: LLMLoopContext): Promise<LLMFunctionToolOuput>;

  definition(): FunctionTool {
    return {
      name: this.name,
      parameters: z.toJSONSchema(this.schema),
      type: 'function',
      strict: true,
      description: this.description,
    };
  }
}
