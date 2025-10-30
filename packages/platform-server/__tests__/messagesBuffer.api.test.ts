import { describe, it, expect } from vitest;
import { MessagesBuffer, ProcessBuffer } from ../src/graph/nodes/agent/messagesBuffer;
import { HumanMessage } from @agyn/llm;

describe(MessagesBuffer

  it('FIFO correctness with mixed enqueue patterns', () => {
    const b = new MessagesBuffer({ debounceMs: 0 });
    const t = 'mix';
    const a = HumanMessage.fromText('a');
    const bmsg = HumanMessage.fromText('b');
    const c = HumanMessage.fromText('c');
    b.enqueue(t, a);
    b.enqueue(t, [bmsg, c]);
    const firstTwo = b.drainAll(t, 2);
    expect(firstTwo.map((m) => m.text)).toEqual(['a', 'b']);
    const last = b.drainOne(t);
    expect(last.map((m) => m.text)).toEqual(['c']);
    expect(b.size(t)).toBe(0);
  });

