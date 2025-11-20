import { describe, it, expect } from 'vitest';
import { ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
import type { SendResult } from '../src/messaging/types';
import { Signal } from '../src/signal';
import { createRunEventsStub } from './helpers/runEvents.stub';

class StubTrigger {
  constructor(private readonly impl: (threadId: string, text: string) => Promise<SendResult>) {}

  async sendToThread(threadId: string, text: string): Promise<SendResult> {
    return this.impl(threadId, text);
  }
}

const buildState = (args: unknown) => {
  const response = new ResponseMessage({
    output: [
      new ToolCallMessage({
        type: 'function_call',
        call_id: 'call-send-message',
        name: 'send_message',
        arguments: JSON.stringify(args),
      } as any).toPlain() as any,
    ] as any,
  });
  return { messages: [response], meta: {}, context: { messageIds: [], memory: [] } } as any;
};

const parsePayload = (result: any) => {
  const last = result.messages.at(-1) as ToolCallOutputMessage;
  expect(last).toBeInstanceOf(ToolCallOutputMessage);
  return JSON.parse(last.text);
};

const baseCtx = {
  threadId: 'thread-1',
  runId: 'run-1',
  finishSignal: new Signal(),
  terminateSignal: new Signal(),
  callerAgent: { getAgentNodeId: () => 'agent-node' },
} as any;

describe('CallToolsLLMReducer send_message integration', () => {
  it('normalizes SlackTrigger exceptions into error envelopes', async () => {
    const trigger = new StubTrigger(async () => {
      throw new Error('transport failed');
    });
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger as any);
    const runEvents = createRunEventsStub();
    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [tool] });

    const state = buildState({ message: 'hello' });
    const result = await reducer.invoke(state, baseCtx);
    const payload = parsePayload(result);

    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('transport failed');
    expect(payload.details?.name).toBe('Error');
  });

  it('handles undefined SlackTrigger responses safely', async () => {
    const trigger = new StubTrigger(async () => undefined as unknown as SendResult);
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger as any);
    const runEvents = createRunEventsStub();
    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [tool] });

    const state = buildState({ message: 'ack' });
    const result = await reducer.invoke(state, baseCtx);
    const payload = parsePayload(result);

    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('send_message_invalid_response');
    expect(payload.details).toBeUndefined();
  });
});
