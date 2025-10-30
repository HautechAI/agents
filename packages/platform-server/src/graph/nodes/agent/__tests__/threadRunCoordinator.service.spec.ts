import { describe, it, expect } from 'vitest';
import { ThreadRunCoordinatorService, type RunResult } from '../threadRunCoordinator.service';
import { ResponseMessage, ToolCallOutputMessage } from '@agyn/llm';

function makeResp(text: string): RunResult {
  // Create a simple ResponseMessage with no output text; ToolCallOutputMessage is simpler
  return ToolCallOutputMessage.fromResponse('call', text);
}

describe('ThreadRunCoordinatorService', () => {
  it('starts immediately when idle (started=true)', async () => {
    const c = new ThreadRunCoordinatorService();
    const handle = c.acquireOrEnqueue({ agentNodeId: 'a', threadId: 't', mode: 'wait' }, async () => makeResp('r1'));
    expect(handle.started).toBe(true);
    const r = await handle.result;
    expect(r).toBeInstanceOf(ToolCallOutputMessage);
  });

  it('wait mode queues starters and runs serially', async () => {
    const c = new ThreadRunCoordinatorService();
    const order: string[] = [];

    const mk = (id: string, delayMs: number) => async () => {
      order.push('start:' + id);
      await new Promise((res) => setTimeout(res, delayMs));
      order.push('end:' + id);
      return makeResp(id);
    };

    const h1 = c.acquireOrEnqueue({ agentNodeId: 'a', threadId: 't', mode: 'wait' }, mk('1', 30));
    const h2 = c.acquireOrEnqueue({ agentNodeId: 'a', threadId: 't', mode: 'wait' }, mk('2', 10));
    const h3 = c.acquireOrEnqueue({ agentNodeId: 'a', threadId: 't', mode: 'wait' }, mk('3', 5));

    expect(h1.started).toBe(true);
    expect(h2.started).toBe(false);
    expect(h3.started).toBe(false);

    const r1 = await h1.result;
    const r2 = await h2.result;
    const r3 = await h3.result;

    expect((r1 as ToolCallOutputMessage).text).toBe('1');
    expect((r2 as ToolCallOutputMessage).text).toBe('2');
    expect((r3 as ToolCallOutputMessage).text).toBe('3');

    // Verify serial order: starts in submission order and ends correspondingly due to queueing
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'end:3']);
  });

  it('injectAfterTools joins active run and resolves to same result', async () => {
    const c = new ThreadRunCoordinatorService();
    let resolveRun: ((v: RunResult) => void) | undefined;
    const first = new Promise<RunResult>((res) => (resolveRun = res));

    // Start first run
    const h1 = c.acquireOrEnqueue({ agentNodeId: 'a', threadId: 't', mode: 'wait' }, async () => first);
    // Joiners
    const h2 = c.acquireOrEnqueue({ agentNodeId: 'a', threadId: 't', mode: 'injectAfterTools' }, async () => makeResp('x'));
    const h3 = c.acquireOrEnqueue({ agentNodeId: 'a', threadId: 't', mode: 'injectAfterTools' }, async () => makeResp('y'));

    expect(h1.started).toBe(true);
    expect(h2.started).toBe(false);
    expect(h3.started).toBe(false);

    const final = makeResp('joined');
    resolveRun!(final);

    const [r1, r2, r3] = await Promise.all([h1.result, h2.result, h3.result]);
    // All must be the same reference or at least equivalent text
    expect((r1 as ToolCallOutputMessage).text).toBe('joined');
    expect((r2 as ToolCallOutputMessage).text).toBe('joined');
    expect((r3 as ToolCallOutputMessage).text).toBe('joined');
  });
});
