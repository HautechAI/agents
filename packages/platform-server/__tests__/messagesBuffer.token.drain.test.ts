
import { describe, it, expect } from "vitest";
import { HumanMessage } from "@agyn/llm";
import { MessagesBuffer, ProcessBuffer } from "../src/graph/nodes/agent/messagesBuffer";

describe("MessagesBuffer.tryDrainByToken", () => {
  it("drains only matching token (allTogether)", () => {
    const b = new MessagesBuffer({ debounceMs: 0 });
    const m1 = HumanMessage.fromText("a") as any;
    const m2 = HumanMessage.fromText("b") as any;
    const m3 = HumanMessage.fromText("c") as any;
    b.enqueueWithToken("t", "A", [m1, m2], 0);
    b.enqueueWithToken("t", "B", [m3], 0);
    const out = b
      .tryDrainByToken("t", "A", ProcessBuffer.AllTogether, 1)
      .map((m: any) => (m as any).text ?? (m as any).content);
    expect(out).toEqual(["a", "b"]);
    const rest = b
      .tryDrain("t", ProcessBuffer.AllTogether, 2)
      .map((m: any) => (m as any).text ?? (m as any).content);
    expect(rest).toEqual(["c"]);
  });

  it("drains one item per call in oneByOne", () => {
    const b = new MessagesBuffer({ debounceMs: 0 });
    const m1 = HumanMessage.fromText("a") as any;
    const m2 = HumanMessage.fromText("b") as any;
    b.enqueueWithToken("t", "X", [m1, m2], 0);
    const o1 = b
      .tryDrainByToken("t", "X", ProcessBuffer.OneByOne, 1)
      .map((m: any) => (m as any).text ?? (m as any).content);
    expect(o1).toEqual(["a"]);
    const o2 = b
      .tryDrainByToken("t", "X", ProcessBuffer.OneByOne, 2)
      .map((m: any) => (m as any).text ?? (m as any).content);
    expect(o2).toEqual(["b"]);
    const o3 = b.tryDrainByToken("t", "X", ProcessBuffer.OneByOne, 3);
    expect(o3).toEqual([]);
  });

  it("respects debounce window", () => {
    const b = new MessagesBuffer({ debounceMs: 10 });
    const m = HumanMessage.fromText("x") as any;
    b.enqueueWithToken("t", "tok", [m], 100);
    expect(b.tryDrainByToken("t", "tok", ProcessBuffer.AllTogether, 105)).toEqual([]);
    const drained = b
      .tryDrainByToken("t", "tok", ProcessBuffer.AllTogether, 111)
      .map((m: any) => (m as any).text ?? (m as any).content);
    expect(drained).toEqual(["x"]);
  });
});
