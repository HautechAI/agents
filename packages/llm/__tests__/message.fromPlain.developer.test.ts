import { describe, expect, it } from 'vitest';
import { Message } from '../src/messages/message';
import { SystemMessage } from '../src/messages/systemMessage';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

describe('Message.fromPlain developer role mapping', () => {
  it('returns SystemMessage for developer role input', () => {
    const plain: ResponseInputItem.Message = {
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text: 'Developer instruction' }],
    };

    const message = Message.fromPlain(plain);

    expect(message).toBeInstanceOf(SystemMessage);
    expect((message as SystemMessage).toPlain().role).toBe('developer');
  });
});
