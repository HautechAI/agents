import { describe, expect, it, vi } from 'vitest';
import { TriggerEventsService } from '../src/services/trigger-events.service';
import { BaseTrigger } from '../src/triggers/base.trigger';

class TestTrigger extends BaseTrigger {
  public async push(thread: string, messages: any[]) {
    // @ts-ignore
    await this.notify(thread, messages);
  }
}

describe('TriggerEventsService', () => {
  it('bind() records and prunes to max', async () => {
    const svc = new TriggerEventsService(3);
    const trig = new TestTrigger();
    svc.bind('n1', trig);
    await trig.push('t1', [{ content: 'a', info: {} }]);
    await trig.push('t2', [{ content: 'b', info: {} }]);
    await trig.push('t3', [{ content: 'c', info: {} }]);
    await trig.push('t4', [{ content: 'd', info: {} }]);
    const items = svc.list('n1');
    expect(items.length).toBe(3);
    // Newest first
    expect(items[0].messages[0].content).toBe('d');
    expect(items[2].messages[0].content).toBe('b');
  });

  it('list() filters by threadId', async () => {
    const svc = new TriggerEventsService(10);
    const trig = new TestTrigger();
    svc.bind('n1', trig);
    await trig.push('x', [{ content: '1', info: {} }]);
    await trig.push('y', [{ content: '2', info: {} }]);
    await trig.push('x', [{ content: '3', info: {} }]);
    const all = svc.list('n1');
    expect(all.length).toBe(3);
    const onlyX = svc.list('n1', { threadId: 'x' });
    expect(onlyX.length).toBe(2);
    expect(onlyX[0].messages[0].content).toBe('3');
  });
});
