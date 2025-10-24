import { describe, it, expect } from 'vitest';
import { ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { FinishFunctionTool } from '../src/nodes/tools/finish/finish.tool';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';

class EchoTool /* simple echo tool */ {
  name = 'echo';
  schema = { parse: (x: any) => x } as any;
  description = 'echo tool';
  async execute(raw: any): Promise<string> {
    return `echo:${JSON.stringify(raw)}`;
  }
}

  });
});
