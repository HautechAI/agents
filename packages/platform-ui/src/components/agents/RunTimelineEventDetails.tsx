import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { stringify as stringifyYaml } from 'yaml';
import type { RunTimelineEvent } from '@/api/types/agents';
import { STATUS_COLORS, formatDuration, getEventTypeLabel } from './runTimelineFormatting';

const wrapStyle = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
} satisfies CSSProperties;

type Attachment = RunTimelineEvent['attachments'][number];

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

function textBlock(value: string, tone: 'default' | 'muted' = 'default', className = '') {
  const base = tone === 'muted' ? 'border bg-gray-50' : 'border bg-white';
  return (
    <div className={`${base} px-3 py-2 text-[11px] text-gray-800 ${className}`} style={wrapStyle}>
      {value}
    </div>
  );
}

function jsonBlock(value: unknown, tone: 'default' | 'muted' = 'muted', className = '') {
  const base = tone === 'muted' ? 'border bg-gray-50' : 'border bg-white';
  return (
    <pre className={`${base} px-3 py-2 text-[11px] text-gray-800 ${className}`} style={wrapStyle}>
      {formatJson(value)}
    </pre>
  );
}

const ANSI_PATTERN = '\u001B\\[[0-9;]*m';
const ANSI_REGEX = new RegExp(ANSI_PATTERN);

type OutputMode = 'text' | 'terminal' | 'markdown' | 'json' | 'yaml';

function isOutputMode(value: string | null): value is OutputMode {
  return value === 'text' || value === 'terminal' || value === 'markdown' || value === 'json' || value === 'yaml';
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_err) {
    return null;
  }
}

function readStoredMode(key: string): OutputMode | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return isOutputMode(raw) ? raw : null;
  } catch (_err) {
    return null;
  }
}

function writeStoredMode(key: string, mode: OutputMode) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(key, mode);
  } catch (_err) {
    // Ignore blocked storage writes
  }
}

function looksLikeJsonString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return tryParseJson(trimmed) !== null;
  }
  return false;
}

const MARKDOWN_HINTS = [/#\s+/m, /```/, /\*\*[^*]+\*\*/, /\* [^*]+/m, /^- /m, /^\d+\.\s+/m, /\[[^\]]+\]\([^)]+\)/];

function looksLikeMarkdownString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return MARKDOWN_HINTS.some((regex) => regex.test(trimmed));
}

function determineDefaultMode(output: unknown): OutputMode {
  if (output === null || output === undefined) {
    return 'text';
  }
  if (Array.isArray(output) || (typeof output === 'object' && output !== null)) {
    return 'json';
  }
  if (typeof output === 'string') {
    if (ANSI_REGEX.test(output)) {
      return 'terminal';
    }
    if (looksLikeJsonString(output)) {
      return 'json';
    }
    if (looksLikeMarkdownString(output)) {
      return 'markdown';
    }
  }
  return 'text';
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return formatJson(value);
}

function formatYaml(value: unknown): string {
  try {
    const data = typeof value === 'string' ? tryParseJson(value) ?? value : value;
    if (typeof data === 'string') {
      return data;
    }
    const yaml = stringifyYaml(data ?? null, { indent: 2 });
    return typeof yaml === 'string' ? yaml.trimEnd() : String(yaml);
  } catch (_err) {
    return formatJson(value);
  }
}

function renderOutputByMode(mode: OutputMode, value: unknown) {
  if (mode === 'json') {
    const parsed = typeof value === 'string' ? tryParseJson(value) ?? value : value;
    return jsonBlock(parsed, 'default');
  }
  if (mode === 'yaml') {
    return (
      <pre className="border bg-white px-3 py-2 text-[11px] text-gray-800" style={wrapStyle}>
        {formatYaml(value)}
      </pre>
    );
  }
  if (mode === 'terminal') {
    return (
      <pre
        className="border border-gray-800 bg-gray-900 px-3 py-2 text-[11px] font-mono text-emerald-100"
        style={{ ...wrapStyle, whiteSpace: 'pre' }}
      >
        {typeof value === 'string' ? value : formatJson(value)}
      </pre>
    );
  }
  const displayText = toText(value);
  if (mode === 'markdown') {
    return (
      <pre className="px-3 py-2 text-[11px] text-gray-800" style={wrapStyle}>
        {displayText}
      </pre>
    );
  }
  return (
    <pre className="px-3 py-2 text-[11px] text-gray-800" style={wrapStyle}>
      {displayText}
    </pre>
  );
}

function useToolOutputMode(eventId: string, value: unknown) {
  const storageKey = useMemo(() => `timeline-output-mode:${eventId}`, [eventId]);
  const [mode, setMode] = useState<OutputMode>(() => {
    return readStoredMode(storageKey) ?? determineDefaultMode(value);
  });

  useEffect(() => {
    const stored = readStoredMode(storageKey);
    const nextMode = stored ?? determineDefaultMode(value);
    setMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [storageKey, value]);

  useEffect(() => {
    writeStoredMode(storageKey, mode);
  }, [mode, storageKey]);

  const rendered = useMemo(() => renderOutputByMode(mode, value), [mode, value]);

  return { mode, setMode, rendered };
}

function ToolOutputSection({
  eventId,
  value,
  errorMessage,
  attachments,
}: {
  eventId: string;
  value: unknown;
  errorMessage: string | null | undefined;
  attachments: Attachment[];
}) {
  const { mode, setMode, rendered } = useToolOutputMode(eventId, value);

  return (
    <div className="flex min-h-0 flex-1 flex-col border">
      <header className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span>Output</span>
        <select
          aria-label="Select output view"
          value={mode}
          onChange={(event) => setMode(event.target.value as OutputMode)}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm"
        >
          <option value="text">text</option>
          <option value="terminal">terminal</option>
          <option value="markdown">markdown</option>
          <option value="json">json</option>
          <option value="yaml">yaml</option>
        </select>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
        <div className="overflow-auto">{rendered}</div>
        {errorMessage && <div className="text-[11px] text-red-600">Error: {errorMessage}</div>}
        {attachments.map((att) => (
          <div key={att.id} className="space-y-1">
            <div className="text-[11px] font-medium text-gray-800">Attachment ({att.id.slice(0, 8)})</div>
            {renderAttachmentContent(att)}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderAttachmentContent(attachment: Attachment, tone: 'default' | 'muted' = 'default') {
  if (typeof attachment.contentText === 'string' && attachment.contentText.length > 0) {
    return textBlock(attachment.contentText, tone);
  }
  if (attachment.contentJson !== undefined && attachment.contentJson !== null) {
    return jsonBlock(attachment.contentJson, tone);
  }
  return <div className="text-[11px] text-gray-500">No preview available</div>;
}

export function RunTimelineEventDetails({ event }: { event: RunTimelineEvent }) {
  const timestamp = new Date(event.ts).toLocaleString();
  const headerMetaItems: string[] = [timestamp];
  const durationLabel = formatDuration(event.durationMs);
  if (durationLabel !== '—') headerMetaItems.push(durationLabel);
  if (event.nodeId) headerMetaItems.push(`Node: ${event.nodeId}`);
  const promptAttachments = event.attachments.filter((att) => att.kind === 'prompt');
  const responseAttachments = event.attachments.filter((att) => att.kind === 'response');
  const toolInputAttachments = event.attachments.filter((att) => att.kind === 'tool_input');
  const toolOutputAttachments = event.attachments.filter((att) => att.kind === 'tool_output');
  const providerRawAttachments = event.attachments.filter((att) => att.kind === 'provider_raw');
  const remainingAttachments = event.attachments.filter(
    (att) => !['prompt', 'response', 'tool_input', 'tool_output', 'provider_raw'].includes(att.kind),
  );

  const shouldShowAttachmentsSection =
    promptAttachments.length > 0 ||
    responseAttachments.length > 0 ||
    providerRawAttachments.length > 0 ||
    remainingAttachments.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-xs text-gray-700" data-testid="timeline-event-details">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
          <span>{getEventTypeLabel(event)}</span>
          <span className={`text-white text-[11px] px-2 py-0.5 rounded ${STATUS_COLORS[event.status] ?? 'bg-gray-500'}`}>{event.status}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
          {headerMetaItems.map((item, index) => (
            <div key={item + index} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">•</span>}
              <span>{item}</span>
            </div>
          ))}
        </div>
        {event.errorCode && <div className="text-red-600">Error code: {event.errorCode}</div>}
        {event.errorMessage && <div className="text-red-600">Error: {event.errorMessage}</div>}
      </section>

      {event.llmCall && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            {event.llmCall.model && (
              <span>
                <span className="font-medium text-gray-800">Model:</span> {event.llmCall.model}
              </span>
            )}
            <span>
              <span className="font-medium text-gray-800">Context items:</span> {event.llmCall.contextItemIds.length}
            </span>
          </div>
          <div className="flex min-h-[260px] flex-col gap-4 md:min-h-[320px] md:flex-row md:gap-6">
            <div className="flex min-h-0 flex-1 flex-col border">
              <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Context</header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                {event.llmCall.contextItemIds.length > 0 ? textBlock(event.llmCall.contextItemIds.join('\n')) : null}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col border">
              <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Output</header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
                {event.llmCall.responseText && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Response</div>
                    {textBlock(event.llmCall.responseText)}
                  </div>
                )}
                {event.llmCall.toolCalls.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-gray-800">Tool calls ({event.llmCall.toolCalls.length})</div>
                    {event.llmCall.toolCalls.map((tc) => (
                      <div key={tc.callId}>{jsonBlock({ callId: tc.callId, name: tc.name, arguments: tc.arguments })}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {event.toolExecution && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            <span>
              <span className="font-medium text-gray-800">Tool:</span> {event.toolExecution.toolName}
            </span>
            <span>
              <span className="font-medium text-gray-800">Status:</span> {event.toolExecution.execStatus}
            </span>
            {event.toolExecution.toolCallId && (
              <span>
                <span className="font-medium text-gray-800">Tool call:</span> {event.toolExecution.toolCallId}
              </span>
            )}
          </div>
          <div className="flex min-h-[220px] flex-col gap-4 md:min-h-[280px] md:flex-row md:gap-6">
            <div className="flex min-h-0 flex-1 flex-col border">
              <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Input</header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-gray-800">Input payload</div>
                  {jsonBlock(event.toolExecution.input)}
                </div>
                {toolInputAttachments.map((att) => (
                  <div key={att.id} className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Attachment ({att.id.slice(0, 8)})</div>
                    {renderAttachmentContent(att)}
                  </div>
                ))}
              </div>
            </div>
            <ToolOutputSection
              eventId={event.id}
              value={event.toolExecution.output}
              errorMessage={event.toolExecution.errorMessage}
              attachments={toolOutputAttachments}
            />
          </div>
        </section>
      )}

      {event.message && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Message</h4>
          <div className="space-y-1">
            <div>ID: {event.message.messageId}</div>
            <div>Role: {event.message.role}</div>
            {event.message.kind && <div>Kind: {event.message.kind}</div>}
            {event.message.text && <div>{textBlock(event.message.text)}</div>}
          </div>
        </section>
      )}

      {event.summarization && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Summarization</h4>
          <div className="space-y-1 text-[11px] text-gray-600">
            <div>
              <span className="font-medium text-gray-800">New context messages:</span> {event.summarization.newContextCount}
            </div>
            {event.summarization.oldContextTokens !== null && event.summarization.oldContextTokens !== undefined && (
              <div>
                <span className="font-medium text-gray-800">Old tokens:</span> {event.summarization.oldContextTokens}
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] font-medium text-gray-800">Summary</div>
            {textBlock(event.summarization.summaryText)}
          </div>
        </section>
      )}

      {event.injection && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Injection</h4>
          <div className="space-y-1">
            <div>Messages: {event.injection.messageIds.join(', ')}</div>
            {event.injection.reason && <div>Reason: {event.injection.reason}</div>}
          </div>
        </section>
      )}

      {shouldShowAttachmentsSection && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Attachments</h4>
          <div className="space-y-3">
            {providerRawAttachments.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">Provider payloads ({providerRawAttachments.length})</div>
                {providerRawAttachments.map((att) => (
                  <div key={`provider-${att.id}`}>{renderAttachmentContent(att, 'muted')}</div>
                ))}
              </div>
            )}
            {promptAttachments.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">Prompt attachments ({promptAttachments.length})</div>
                {promptAttachments.map((att) => (
                  <div key={`prompt-${att.id}`}>{renderAttachmentContent(att)}</div>
                ))}
              </div>
            )}
            {responseAttachments.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">Response attachments ({responseAttachments.length})</div>
                {responseAttachments.map((att) => (
                  <div key={`response-${att.id}`}>{renderAttachmentContent(att)}</div>
                ))}
              </div>
            )}
            {remainingAttachments.map((att) => (
              <div key={att.id} className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">
                  {att.kind} ({att.id.slice(0, 8)}) • {att.sizeBytes} bytes {att.isGzip ? '(gzipped)' : ''}
                </div>
                {renderAttachmentContent(att)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
