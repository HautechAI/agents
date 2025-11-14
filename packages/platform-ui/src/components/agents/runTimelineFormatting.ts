import type { RunEventStatus, RunEventType, RunTimelineEvent } from '@/api/types/agents';

export const TYPE_LABELS: Record<RunEventType, string> = {
  invocation_message: 'Invocation Message',
  injection: 'Injection',
  llm_call: 'LLM Call',
  tool_execution: 'Tool Execution',
  summarization: 'Summarization',
};

export const STATUS_COLORS: Record<RunEventStatus, string> = {
  pending: 'bg-gray-400',
  running: 'bg-blue-500',
  success: 'bg-green-600',
  error: 'bg-red-600',
  cancelled: 'bg-yellow-500',
};

export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return null;
  if (ms < 1000 && ms > -1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60 && seconds > -60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.trunc(seconds / 60);
  const remSeconds = seconds % 60;
  return `${minutes}m ${remSeconds.toFixed(1)}s`;
}

export function getEventTypeLabel(event: RunTimelineEvent): string {
  const base = TYPE_LABELS[event.type] ?? event.type;
  if (event.type === 'tool_execution' && event.toolExecution?.toolName) {
    return `${base} — ${event.toolExecution.toolName}`;
  }
  return base;
}
