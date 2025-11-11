import { useState } from 'react';
import type { RunTimelineEvent, RunEventType, RunEventStatus } from '@/api/types/agents';

const TYPE_LABELS: Record<RunEventType, string> = {
  invocation_message: 'Invocation Message',
  injection: 'Injection',
  llm_call: 'LLM Call',
  tool_execution: 'Tool Execution',
  summarization: 'Summarization',
};

const STATUS_COLORS: Record<RunEventStatus, string> = {
  pending: 'bg-gray-400',
  running: 'bg-blue-500',
  success: 'bg-green-600',
  error: 'bg-red-600',
  cancelled: 'bg-yellow-500',
};

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

function formatDuration(ms: number | null): string {
  if (!ms || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return `${minutes}m ${remSeconds.toFixed(1)}s`;
}

type Props = {
  event: RunTimelineEvent;
};

export function RunTimelineEventCard({ event }: Props) {
  const [expanded, setExpanded] = useState(false);
  const timestamp = new Date(event.ts).toLocaleString();
  const startedAt = event.startedAt ? new Date(event.startedAt).toLocaleTimeString() : null;
  const endedAt = event.endedAt ? new Date(event.endedAt).toLocaleTimeString() : null;

  return (
    <div className="border rounded-md bg-white shadow-sm p-3" data-testid="timeline-event">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-col text-left">
          <span className="text-xs text-gray-500">#{event.ordinal} • {timestamp}</span>
          <span className="text-sm font-semibold">{TYPE_LABELS[event.type] ?? event.type}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-white text-xs px-2 py-0.5 rounded ${STATUS_COLORS[event.status] ?? 'bg-gray-500'}`}>{event.status}</span>
          <button
            type="button"
            className="text-xs px-2 py-0.5 border rounded bg-gray-50 hover:bg-gray-100"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-3">
        <span>Node: {event.nodeId ?? '—'}</span>
        <span>Source: {event.sourceKind}</span>
        <span>Duration: {formatDuration(event.durationMs)}</span>
        {startedAt && <span>Started: {startedAt}</span>}
        {endedAt && <span>Ended: {endedAt}</span>}
        {event.errorCode && <span className="text-red-600">Error code: {event.errorCode}</span>}
        {event.errorMessage && <span className="text-red-600">Error: {event.errorMessage}</span>}
      </div>
      {expanded && (
        <div className="mt-3 space-y-3 text-xs">
          <section>
            <h4 className="font-semibold text-gray-700">Metadata</h4>
            <pre className="mt-1 bg-gray-100 rounded p-2 overflow-x-auto" aria-label="Event metadata">
              {formatJson(event.metadata)}
            </pre>
          </section>

          {event.message && (
            <section>
              <h4 className="font-semibold text-gray-700">Message</h4>
              <div className="mt-1 space-y-1">
                <div>ID: {event.message.messageId}</div>
                <div>Role: {event.message.role}</div>
                {event.message.text && <div className="whitespace-pre-wrap">{event.message.text}</div>}
                <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.message.source)}</pre>
              </div>
            </section>
          )}

          {event.llmCall && (
            <section>
              <h4 className="font-semibold text-gray-700">LLM Call</h4>
              <div className="mt-1 space-y-1">
                <div>Provider: {event.llmCall.provider ?? '—'}</div>
                <div>Model: {event.llmCall.model ?? '—'}</div>
                <div>Stop reason: {event.llmCall.stopReason ?? '—'}</div>
                {event.llmCall.prompt && (
                  <details className="mt-1">
                    <summary className="cursor-pointer">Prompt</summary>
                    <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{event.llmCall.prompt}</pre>
                  </details>
                )}
                {event.llmCall.responseText && (
                  <details className="mt-1">
                    <summary className="cursor-pointer">Response</summary>
                    <pre className="bg-gray-100 rounded p-2 overflow-x-auto whitespace-pre-wrap">{event.llmCall.responseText}</pre>
                  </details>
                )}
                <details className="mt-1">
                  <summary className="cursor-pointer">Raw response</summary>
                  <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.llmCall.rawResponse)}</pre>
                </details>
                {event.llmCall.toolCalls.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer">Tool calls ({event.llmCall.toolCalls.length})</summary>
                    <div className="mt-1 space-y-2">
                      {event.llmCall.toolCalls.map((tc) => (
                        <pre key={tc.callId} className="bg-gray-100 rounded p-2 overflow-x-auto">
                          {formatJson({ callId: tc.callId, name: tc.name, arguments: tc.arguments })}
                        </pre>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
          )}

          {event.toolExecution && (
            <section>
              <h4 className="font-semibold text-gray-700">Tool Execution</h4>
              <div className="mt-1 space-y-1">
                <div>Tool: {event.toolExecution.toolName}</div>
                <div>Status: {event.toolExecution.execStatus}</div>
                <div>Tool Call: {event.toolExecution.toolCallId ?? '—'}</div>
                <details>
                  <summary className="cursor-pointer">Input</summary>
                  <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.toolExecution.input)}</pre>
                </details>
                <details>
                  <summary className="cursor-pointer">Output</summary>
                  <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.toolExecution.output)}</pre>
                </details>
                {event.toolExecution.raw && (
                  <details>
                    <summary className="cursor-pointer">Raw</summary>
                    <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.toolExecution.raw)}</pre>
                  </details>
                )}
                {event.toolExecution.errorMessage && <div className="text-red-600">Error: {event.toolExecution.errorMessage}</div>}
              </div>
            </section>
          )}

          {event.summarization && (
            <section>
              <h4 className="font-semibold text-gray-700">Summarization</h4>
              <div className="mt-1 space-y-1">
                <div>New context messages: {event.summarization.newContextCount}</div>
                <div>Old tokens: {event.summarization.oldContextTokens ?? '—'}</div>
                <details>
                  <summary className="cursor-pointer">Summary</summary>
                  <pre className="bg-gray-100 rounded p-2 overflow-x-auto whitespace-pre-wrap">{event.summarization.summaryText}</pre>
                </details>
                <details>
                  <summary className="cursor-pointer">Raw payload</summary>
                  <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.summarization.raw)}</pre>
                </details>
              </div>
            </section>
          )}

          {event.injection && (
            <section>
              <h4 className="font-semibold text-gray-700">Injection</h4>
              <div className="mt-1 space-y-1">
                <div>Messages: {event.injection.messageIds.join(', ')}</div>
                <div>Reason: {event.injection.reason ?? '—'}</div>
              </div>
            </section>
          )}

          {event.attachments.length > 0 && (
            <section>
              <h4 className="font-semibold text-gray-700">Attachments ({event.attachments.length})</h4>
              <div className="mt-1 space-y-2">
                {event.attachments.map((att) => (
                  <div key={att.id} className="border rounded p-2 bg-gray-50">
                    <div className="font-medium">{att.kind}</div>
                    <div className="text-gray-600">Size: {att.sizeBytes} bytes {att.isGzip ? '(gzipped)' : ''}</div>
                    {att.contentText && (
                      <details>
                        <summary className="cursor-pointer">Text content</summary>
                        <pre className="bg-white rounded p-2 overflow-x-auto whitespace-pre-wrap">{att.contentText}</pre>
                      </details>
                    )}
                    {att.contentJson && (
                      <details>
                        <summary className="cursor-pointer">JSON content</summary>
                        <pre className="bg-white rounded p-2 overflow-x-auto">{formatJson(att.contentJson)}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
