import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunTimelineEventDetails } from '../RunTimelineEventDetails';
import type { RunTimelineEvent } from '@/api/types/agents';

function buildEvent(overrides: Partial<RunTimelineEvent> = {}): RunTimelineEvent {
  const base: RunTimelineEvent = {
    id: 'evt-1',
    runId: 'run-1',
    threadId: 'thread-1',
    type: 'tool_execution',
    status: 'success',
    ts: '2024-01-01T00:00:00.000Z',
    startedAt: null,
    endedAt: null,
    durationMs: 1200,
    nodeId: 'node-1',
    sourceKind: 'internal',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    llmCall: undefined,
    toolExecution: {
      toolName: 'Example tool',
      toolCallId: 'call-1',
      execStatus: 'success',
      input: { query: 'status' },
      output: { result: 'ok' },
      errorMessage: null,
      raw: { raw: true },
    },
    summarization: undefined,
    injection: undefined,
    message: undefined,
    attachments: [],
  };

  const { toolExecution, llmCall, message, attachments, ...rest } = overrides;
  const hasToolOverride = Object.prototype.hasOwnProperty.call(overrides, 'toolExecution');
  const finalToolExecution = hasToolOverride ? toolExecution : base.toolExecution;

  return {
    ...base,
    ...rest,
    llmCall: llmCall ?? base.llmCall,
    toolExecution: finalToolExecution ? { ...base.toolExecution!, ...finalToolExecution } : finalToolExecution,
    message: message ?? base.message,
    attachments: attachments ?? base.attachments,
  };
}

beforeEach(() => {
  try {
    window.sessionStorage.clear();
  } catch (_err) {
    // Ignored – storage may be unavailable in some environments
  }
});

afterEach(() => {
  if (Object.getOwnPropertyDescriptor(window.navigator, 'clipboard')) {
    delete (window.navigator as Navigator & { clipboard?: unknown }).clipboard;
  }
});

describe('RunTimelineEventDetails', () => {
  it('omits placeholders and exposes raw event button', () => {
    const event = buildEvent({ durationMs: null, nodeId: null, toolExecution: undefined });
    const timestamp = new Date(event.ts).toLocaleString();

    render(<RunTimelineEventDetails event={event} />);

    expect(screen.getByRole('button', { name: 'View raw event' })).toBeInTheDocument();
    expect(screen.getByText(timestamp)).toBeInTheDocument();
    expect(screen.queryByText(/Node:/i)).toBeNull();
    expect(screen.queryByText(/Source:/i)).toBeNull();
    expect(screen.queryByText(/Metadata/i)).toBeNull();
    expect(screen.queryByText(/Raw payload/i)).toBeNull();
  });

  it('opens raw modal, copies payload, and restores focus on close', async () => {
    const event = buildEvent({ durationMs: 1500 });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<RunTimelineEventDetails event={event} />);

    const trigger = screen.getByRole('button', { name: 'View raw event' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Raw event data' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(event, null, 2));
    expect(screen.getByText('Copied!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('defaults output viewer to json for objects and allows switching', async () => {
    const user = userEvent.setup();
    render(<RunTimelineEventDetails event={buildEvent()} />);

    const select = screen.getByLabelText('Select output view');
    expect(select).toHaveValue('json');

    await user.selectOptions(select, 'text');
    expect(select).toHaveValue('text');
    expect(screen.getByText(/"result": "ok"/)).toBeInTheDocument();
  });

  it('detects terminal output via ansi escape sequences', () => {
    const ansiOutput = '\u001b[31mFailure\u001b[0m';
    render(
      <RunTimelineEventDetails
        event={buildEvent({ toolExecution: { output: ansiOutput, raw: null } })}
      />,
    );

    expect(screen.getByLabelText('Select output view')).toHaveValue('terminal');
  });

  it('persists selected visualization per event id', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RunTimelineEventDetails event={buildEvent({ id: 'evt-a' })} />);
    const select = screen.getByLabelText('Select output view');

    await user.selectOptions(select, 'markdown');
    expect(select).toHaveValue('markdown');

    rerender(<RunTimelineEventDetails event={buildEvent({ id: 'evt-a' })} />);
    expect(screen.getByLabelText('Select output view')).toHaveValue('markdown');

    rerender(<RunTimelineEventDetails event={buildEvent({ id: 'evt-b' })} />);
    expect(screen.getByLabelText('Select output view')).toHaveValue('json');
  });

  it('shows response and tool calls blocks only when data present', () => {
    const llmOnlyRaw = buildEvent({
      type: 'llm_call',
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: ['ctx-1'],
        responseText: null,
        rawResponse: { foo: 'bar' },
        toolCalls: [],
      },
      toolExecution: undefined,
    });

    render(<RunTimelineEventDetails event={llmOnlyRaw} />);
    expect(screen.queryByText('Response')).toBeNull();
    expect(screen.queryByText(/Tool calls/)).toBeNull();
    expect(screen.queryByText('Raw response')).toBeNull();
  });

  it('renders response, tool calls, and attachments when provided', () => {
    const event = buildEvent({
      type: 'llm_call',
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: 'All good',
        rawResponse: { content: 'All good' },
        toolCalls: [{ callId: 'tool-1', name: 'search', arguments: { q: 'hi' } }],
      },
      attachments: [
        {
          id: 'att-resp',
          kind: 'response',
          isGzip: false,
          sizeBytes: 64,
          contentJson: null,
          contentText: 'response attachment',
        },
      ],
      toolExecution: undefined,
    });

    render(<RunTimelineEventDetails event={event} />);
    const responseLabel = screen.getByText('Response');
    const responseContainer = responseLabel.parentElement;
    expect(responseContainer).toBeTruthy();
    if (responseContainer) {
      expect(within(responseContainer).getByText('All good')).toBeInTheDocument();
    }

    expect(screen.getByText(/Tool calls/)).toBeInTheDocument();
    expect(screen.getByText(/search/)).toBeInTheDocument();
    expect(screen.getByText(/Response attachment/)).toBeInTheDocument();
  });

  it('does not crash when sessionStorage access is blocked', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(() => render(<RunTimelineEventDetails event={buildEvent()} />)).not.toThrow();

    if (originalDescriptor) {
      Object.defineProperty(window, 'sessionStorage', originalDescriptor);
    } else {
      delete (window as { sessionStorage?: Storage }).sessionStorage;
    }
  });

  it('renders output selector in header and omits inline raw payload text', () => {
    render(<RunTimelineEventDetails event={buildEvent()} />);

    const outputHeader = screen.getByText('Output').closest('header');
    expect(outputHeader).toBeTruthy();
    if (outputHeader) {
      expect(within(outputHeader).getByRole('combobox', { name: 'Select output view' })).toBeInTheDocument();
    }

    expect(screen.queryByText(/Raw payload/)).toBeNull();
  });

  it('omits metadata and source detail rows from overview', () => {
    render(<RunTimelineEventDetails event={buildEvent()} />);

    expect(screen.queryByText('Metadata')).toBeNull();
    expect(screen.queryByText(/Source:/)).toBeNull();
    expect(screen.queryByText(/Started/)).toBeNull();
    expect(screen.queryByText(/Ended/)).toBeNull();
  });

  it('renders prompt attachments within the context column only', () => {
    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      attachments: [
        {
          id: 'att-prompt',
          kind: 'prompt',
          isGzip: false,
          sizeBytes: 128,
          contentJson: null,
          contentText: 'Prompt body',
        },
        {
          id: 'att-extra',
          kind: 'other',
          isGzip: false,
          sizeBytes: 16,
          contentJson: { foo: 'bar' },
          contentText: null,
        },
      ],
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: null,
        rawResponse: null,
        toolCalls: [],
      },
    });

    render(<RunTimelineEventDetails event={event} />);

    expect(screen.getByText(/Prompt attachment/)).toBeInTheDocument();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.queryByText('Prompt attachments (1)')).toBeNull();
    expect(screen.getByText(/other \(att/)).toBeInTheDocument();
  });

  it('hides tool call metadata when no identifier is present', () => {
    render(<RunTimelineEventDetails event={buildEvent({ toolExecution: { toolCallId: null } })} />);

    expect(screen.queryByText(/Tool call:/)).toBeNull();
  });

  it('omits summarization raw payload block', () => {
    const event = buildEvent({
      type: 'summarization',
      toolExecution: undefined,
      summarization: {
        summaryText: 'Short summary',
        newContextCount: 2,
        oldContextTokens: null,
        raw: { verbose: true },
      },
    });

    render(<RunTimelineEventDetails event={event} />);

    expect(screen.getByRole('heading', { name: 'Summarization' })).toBeInTheDocument();
    expect(screen.queryByText(/Raw payload/)).toBeNull();
  });

  it('omits injection reason when missing', () => {
    const event = buildEvent({
      type: 'injection',
      toolExecution: undefined,
      injection: {
        messageIds: ['m-1'],
        reason: null,
      },
    });

    render(<RunTimelineEventDetails event={event} />);

    expect(screen.getByText(/Messages:/)).toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).toBeNull();
  });
});
