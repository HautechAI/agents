import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemindMeTool } from '../tools/remind_me.tool';
import { LoggerService } from '../services/logger.service';

// Minimal typed stub for the caller agent used by the tool
interface CallerAgentStub {
  invoke(thread: string, messages: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>): Promise<unknown>;
}

// Helper to extract callable tool
function getToolInstance() {
  const logger = new LoggerService();
  const tool = new RemindMeTool(logger).init();
  return tool;
}

describe('RemindMeTool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('schedules reminder and invokes caller_agent after delay', async () => {
    const tool = getToolInstance();

    const invokeSpy = vi.fn(async () => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const thread_id = 't-123';

    const res = await tool.invoke(
      { delayMs: 1000, note: 'Ping' },
      { configurable: { thread_id, caller_agent } },
    );

    // Immediate ack
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    expect(parsed.status).toBe('scheduled');
    expect(parsed.etaMs).toBe(1000);
    expect(typeof parsed.at).toBe('string');

    // Advance timers and ensure invoke called once with system message
    await vi.advanceTimersByTimeAsync(1000);

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy.mock.calls[0][0]).toBe(thread_id);
    expect(invokeSpy.mock.calls[0][1]).toEqual([
      { kind: 'system', content: 'Ping', info: { reason: 'reminded' } },
    ]);
  });

  it('schedules immediate reminder when delayMs=0', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async () => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const config = { configurable: { thread_id: 't-0', caller_agent } };

    const res = await tool.invoke({ delayMs: 0, note: 'Now' }, config);
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    expect(parsed.status).toBe('scheduled');
    expect(parsed.etaMs).toBe(0);

    // Run pending timers immediately
    await vi.runOnlyPendingTimersAsync();
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy.mock.calls[0][1]).toEqual([
      { kind: 'system', content: 'Now', info: { reason: 'reminded' } },
    ]);
  });

  it('returns error when thread_id missing', async () => {
    const tool = getToolInstance();
    const caller_agent: CallerAgentStub = { invoke: vi.fn(async () => undefined) };
    const res = await tool.invoke({ delayMs: 1, note: 'x' }, { configurable: { caller_agent } });
    expect(typeof res).toBe('string');
    expect(String(res)).toContain('missing thread_id');
  });

  it('returns error when caller_agent missing', async () => {
    const tool = getToolInstance();
    const res = await tool.invoke({ delayMs: 1, note: 'x' }, { configurable: { thread_id: 't' } });
    expect(typeof res).toBe('string');
    expect(String(res)).toContain('missing caller_agent');
  });
});
