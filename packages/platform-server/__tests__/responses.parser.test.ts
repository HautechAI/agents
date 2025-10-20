import { describe, it, expect, vi } from 'vitest';
import { OpenAIResponsesService } from '../src/services/openai.responses';

const make = (segments: any[]) => ({ id: 'resp_1', output: [{ type: 'message', role: 'assistant', content: segments }] });

describe('Responses parser', () => {
  it('parses reasoning + output_text', () => {
    const raw = make([
      { type: 'reasoning', text: 'thinking' },
      { type: 'output_text', text: 'hello' },
    ]);
    const logger = { warn: vi.fn(), debug: vi.fn() } as any;
    const res = OpenAIResponsesService.parseResponse(raw, logger);
    expect(res.content).toBe('hello');
    expect(res.toolCalls.length).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('parses tool_use only', () => {
    const raw = make([{ type: 'tool_use', id: 't1', name: 'do', input: { a: 1 } }]);
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('');
    expect(res.toolCalls[0]).toEqual({ id: 't1', name: 'do', arguments: { a: 1 } });
  });

  it('reasoning followed by tool_use (no output_text) warns and preserves toolCalls', () => {
    const raw = make([
      { type: 'reasoning', text: 'think' },
      { type: 'tool_use', id: 't2', name: 'calc', input: { n: 2 } },
    ]);
    const logger = { warn: vi.fn(), debug: vi.fn() } as any;
    const res = OpenAIResponsesService.parseResponse(raw, logger);
    expect(res.content).toBe('');
    expect(res.toolCalls[0]).toEqual({ id: 't2', name: 'calc', arguments: { n: 2 } });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('concatenates multiple output_text segments', () => {
    const raw = make([
      { type: 'output_text', text: 'part1' },
      { type: 'output_text', text: 'part2' },
    ]);
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('part1\npart2');
  });

  it('tool_result round-trip scenario ignored in output parsing', () => {
    const raw = make([
      { type: 'output_text', text: 'before' },
      { type: 'tool_result', tool_use_id: 't1', content: { ok: true } },
      { type: 'output_text', text: 'after' },
    ]);
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('before\nafter');
    expect(res.toolCalls.length).toBe(0);
  });
});

