import type {
  RunEventStatus,
  RunTimelineEvent,
  RunTimelineSummary,
} from '@/api/types/agents';
import type { RunEvent } from '@/components/RunEventsList';
import type { Status } from '@/components/StatusIndicator';
import type { EventFilter, StatusFilter } from '@/components/screens/RunScreen';

type TokenAggregate = {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  total: number;
};

const STATUS_FILTER_MAP: Record<RunEventStatus, StatusFilter> = {
  pending: 'running',
  running: 'running',
  success: 'finished',
  error: 'failed',
  cancelled: 'terminated',
};

const SUMMARY_STATUS_MAP: Record<NonNullable<RunTimelineSummary['status']>, Status> = {
  running: 'running',
  finished: 'finished',
  terminated: 'terminated',
};

const TOOL_SUBTYPE_GUARDS: Array<{ keyword: string; subtype: 'shell' | 'manage' }> = [
  { keyword: 'shell', subtype: 'shell' },
  { keyword: 'terminal', subtype: 'shell' },
  { keyword: 'manage', subtype: 'manage' },
];

function coerceString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function deriveMessageContent(event: RunTimelineEvent): { subtype: 'source' | 'intermediate' | 'result'; content: string } {
  if (event.type === 'injection') {
    return {
      subtype: 'intermediate',
      content: event.injection?.reason ? coerceString(event.injection.reason) : 'Injected message',
    };
  }

  const kind = event.message?.kind;
  const subtype = kind === 'intermediate' || kind === 'result' ? kind : 'source';
  const text = event.message?.text ?? '';
  return { subtype, content: text ?? '' };
}

function deriveToolSubtype(toolName: string | undefined): string {
  if (!toolName) return 'generic';
  const lower = toolName.toLowerCase();
  const match = TOOL_SUBTYPE_GUARDS.find((guard) => lower.includes(guard.keyword));
  return match?.subtype ?? 'generic';
}

export function toEventFilter(event: RunTimelineEvent): EventFilter {
  switch (event.type) {
    case 'llm_call':
      return 'llm';
    case 'tool_execution':
      return 'tool';
    case 'summarization':
      return 'summary';
    case 'injection':
    case 'invocation_message':
    default:
      return 'message';
  }
}

export function toStatusFilter(status: RunEventStatus): StatusFilter {
  return STATUS_FILTER_MAP[status];
}

export function mapTimelineEventToRunEvent(event: RunTimelineEvent): RunEvent {
  const filterType = toEventFilter(event);
  const type: RunEvent['type'] = filterType === 'summary' ? 'summarization' : filterType;
  const status = STATUS_FILTER_MAP[event.status];
  const base = {
    id: event.id,
    type,
    timestamp: event.ts,
    startedAt: event.startedAt ?? null,
    endedAt: event.endedAt ?? null,
    durationMs: event.durationMs ?? null,
    status,
  } satisfies Omit<RunEvent, 'data'>;

  if (type === 'llm') {
    const usage = event.llmCall?.usage;
    const tokens: TokenAggregate = {
      input: usage?.inputTokens ?? 0,
      cached: usage?.cachedInputTokens ?? 0,
      output: usage?.outputTokens ?? 0,
      reasoning: usage?.reasoningTokens ?? 0,
      total: usage?.totalTokens ?? 0,
    };

    return {
      ...base,
      data: {
        model: event.llmCall?.model ?? undefined,
        response: event.llmCall?.responseText ?? undefined,
        tokens,
        cost: '$0',
        context: [...(event.llmCall?.contextItemIds ?? [])],
        newContextCount: event.llmCall?.newContextItemCount ?? 0,
        toolCalls: event.llmCall?.toolCalls,
      },
    };
  }

  if (type === 'tool') {
    const toolName = event.toolExecution?.toolName ?? 'Tool';
    return {
      ...base,
      data: {
        toolName,
        toolSubtype: deriveToolSubtype(toolName),
        input: event.toolExecution?.input,
        output: event.toolExecution?.output,
        command: (event.toolExecution?.input as { command?: string } | null | undefined)?.command,
        workingDir: (event.toolExecution?.input as { cwd?: string } | null | undefined)?.cwd,
        toolCallId: event.toolExecution?.toolCallId ?? undefined,
        execStatus: event.toolExecution?.execStatus,
        errorMessage: event.toolExecution?.errorMessage ?? undefined,
      },
    };
  }

  if (type === 'summarization') {
    return {
      ...base,
      data: {
        summary: event.summarization?.summaryText ?? '',
        newContextCount: event.summarization?.newContextCount ?? 0,
        oldContextTokens: event.summarization?.oldContextTokens ?? undefined,
        oldContext: [],
        newContext: [],
      },
    };
  }

  const message = deriveMessageContent(event);
  return {
    ...base,
    data: {
      messageSubtype: message.subtype,
      content: message.content,
      messageId: event.message?.messageId ?? undefined,
      role: event.message?.role ?? undefined,
    },
  };
}

export function aggregateLlmUsage(events: RunTimelineEvent[]): TokenAggregate {
  return events.reduce<TokenAggregate>((acc, event) => {
    const usage = event.llmCall?.usage;
    if (!usage) return acc;
    acc.input += usage.inputTokens ?? 0;
    acc.cached += usage.cachedInputTokens ?? 0;
    acc.output += usage.outputTokens ?? 0;
    acc.reasoning += usage.reasoningTokens ?? 0;
    acc.total += usage.totalTokens ?? 0;
    return acc;
  }, { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 });
}

export function mapRunSummaryStatusToScreenStatus(status: RunTimelineSummary['status'] | undefined): Status {
  if (!status) return 'pending';
  return SUMMARY_STATUS_MAP[status] ?? 'pending';
}
