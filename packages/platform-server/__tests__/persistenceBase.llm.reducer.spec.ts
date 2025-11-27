import { describe, expect, it } from 'vitest';
import { DeveloperMessage } from '@agyn/llm';
import { PersistenceBaseLLMReducer } from '../src/llm/reducers/persistenceBase.llm.reducer';

class TestPersistenceReducer extends PersistenceBaseLLMReducer {
  async invoke(state: any): Promise<any> {
    return state;
  }

  public deserialize(plain: unknown) {
    // @ts-expect-error accessing protected method for test purposes
    return this.deserializeState(plain);
  }

  public isDevMessage(val: unknown): boolean {
    // @ts-expect-error accessing protected method for test purposes
    return this.isDeveloperMessage(val);
  }
}

describe('PersistenceBaseLLMReducer developer message support', () => {
  const reducer = new TestPersistenceReducer();

  it('recognizes developer message payloads', () => {
    const plain = DeveloperMessage.fromText('instructions').toPlain();
    expect(reducer.isDevMessage(plain)).toBe(true);
  });

  it('transforms persisted system-role message into DeveloperMessage', () => {
    const legacy = {
      messages: [
        {
          kind: 'system',
          value: {
            type: 'message',
            role: 'system',
            content: [{ type: 'input_text', text: 'legacy system prompt' }],
          },
        },
      ],
      context: { messageIds: [], memory: [] },
    };

    const state = reducer.deserialize(legacy);

    expect(state.messages[0]).toBeInstanceOf(DeveloperMessage);
    expect(state.messages[0].role).toBe('developer');
    expect(state.messages[0].text).toBe('legacy system prompt');
  });
});
