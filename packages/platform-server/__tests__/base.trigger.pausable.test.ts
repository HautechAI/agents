import { describe, it, expect, vi } from 'vitest';
// Skipped due to removal of legacy BaseTrigger pause/resume; see Issue #451
import { it } from 'vitest';
it.skip('BaseTrigger pause/resume removed; pause/resume no longer supported', () => {});

class TestTrigger extends BaseTrigger {
  constructor() { super(); }
  send(thread: string, messages: TriggerMessage[]) { return this['notify'](thread, messages); }
}

describe('BaseTrigger Pausable', () => {
  it('drops events when paused and resumes correctly', async () => {
    const t = new TestTrigger();
    const calls: Array<{ thread: string; msgs: TriggerMessage[] }> = [];
    await t.subscribe({ invoke: async (thread, msgs) => { calls.push({ thread, msgs }); } });

    await t.send('th1', [{ content: 'a', info: {} }]);
    expect(calls.length).toBe(1);

    t.pause();
    await t.send('th1', [{ content: 'b', info: {} }]);
    await t.send('th1', [{ content: 'c', info: {} }]);
    expect(calls.length).toBe(1); // still only first

    t.resume();
    await t.send('th1', [{ content: 'd', info: {} }]);
    expect(calls.length).toBe(2);
    expect(calls[1].msgs.map(m => m.content)).toEqual(['d']);
  });
});
