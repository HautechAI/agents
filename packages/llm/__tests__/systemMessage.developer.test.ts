import { describe, expect, it } from 'vitest';
import { SystemMessage } from '../src/messages/systemMessage';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

describe('SystemMessage developer role normalization', () => {
  it('emits developer role when constructed from text', () => {
    const message = SystemMessage.fromText('Follow developer instructions.');

    expect(message.role).toBe('developer');
    expect(message.toPlain().role).toBe('developer');
  });

  it('normalizes legacy system role to developer on output', () => {
    const legacySource: ResponseInputItem.Message & { role: 'system' } = {
      role: 'system',
      content: [{ type: 'input_text', text: 'Legacy instruction' }],
    };

    const message = new SystemMessage(legacySource);

    expect(message.role).toBe('developer');
    expect(message.toPlain().role).toBe('developer');
  });
});
