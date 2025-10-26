import { describe, it, expect, vi, beforeEach } from 'vitest';
// Skipped due to removal of legacy BaseTrigger; see Issue #451
import { describe, it } from 'vitest';
it.skip('BaseTrigger legacy behavior removed; covered by SlackTrigger tests', () => {});

// Concrete test subclass exposing protected notify
class TestTrigger extends BaseTrigger {
  constructor() {
    super();
  }
  emit(thread: string, messages: TriggerMessage[]) {
    return this.notify(thread, messages);
  }
}

describe('BaseTrigger', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('delivers to listeners immediately', async () => {
    const trigger = new TestTrigger();
    const received: { thread: string; messages: TriggerMessage[] }[] = [];
    await trigger.subscribe({
      invoke: async (thread, messages) => {
        received.push({ thread, messages });
      },
    });
    await trigger.emit('t1', [{ content: 'a', info: {} }]);
    expect(received.length).toBe(1);
    expect(received[0].messages.map((m) => m.content)).toEqual(['a']);
  });
});
