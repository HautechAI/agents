import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ContextMessageLike {
  role: string;
  content?: unknown;
  toolCalls?: unknown[];
  tool_calls?: unknown;
  toolCallId?: string;
  tool_call_id?: string;
  [k: string]: unknown;
}

export interface ContextViewProps {
  messages: ContextMessageLike[] | undefined | null;
  title?: string;
  /** If true (default) collapse history up to pivot AI message */
  collapse?: boolean;
  /** Optional style override */
  style?: React.CSSProperties;
}

/**
 * Reusable viewer for LLM context/chat messages with optional collapsing behavior.
 * Extracted from SpanDetails to allow reuse (e.g., summarize spans comparing old/new context).
 */
/**
 * ContextView renders a list of chat/LLM messages with an optional collapsing UX that
 * shows only the tail after the last AI message (to focus on the most recent human/tool inputs).
 * Provide messages as an array of objects each containing at least { role, content }.
 */
export function ContextView({ messages, title = 'Context', collapse = true, style }: ContextViewProps) {
  const contextMessages = Array.isArray(messages) ? messages : [];
  // Determine pivot AI index: normally last AI with something after it; if last AI is final message, pivot is previous AI.
  const pivotAiIndex = useMemo(() => {
    let indices: number[] = [];
    contextMessages.forEach((m, i) => {
      if ((m as ContextMessageLike)?.role === 'ai') indices.push(i);
    });
    if (indices.length === 0) return -1; // no AI => no collapse
    const last = indices[indices.length - 1];
    if (last === contextMessages.length - 1) {
      // last AI is final message; pick previous AI if present
      if (indices.length >= 2) return indices[indices.length - 2];
      return -1; // only one AI and it's final -> no collapse per spec
    }
    return last; // normal case
  }, [contextMessages]);

  const collapseEnabled = collapse && pivotAiIndex >= 0;
  const [historyCollapsed, setHistoryCollapsed] = useState<boolean>(collapseEnabled);
  useEffect(() => setHistoryCollapsed(collapseEnabled), [collapseEnabled]);
  const visibleMessageIndices = useMemo(() => {
    if (!historyCollapsed || !collapseEnabled) return contextMessages.map((_, i) => i);
    // show tail strictly after pivot AI index
    const arr: number[] = [];
    for (let i = pivotAiIndex + 1; i < contextMessages.length; i++) arr.push(i);
    return arr;
  }, [historyCollapsed, collapseEnabled, pivotAiIndex, contextMessages]);

  return (
    <div
      data-testid="obsui-context-view"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, ...style }}
    >
      {title && <h3 style={{ margin: '0 0 4px 0', fontSize: 13 }}>{title}</h3>}
      {collapseEnabled && historyCollapsed && (
        <button
          data-testid="obsui-context-toggle-show"
          onClick={() => setHistoryCollapsed(false)}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#0366d6',
            fontSize: 11,
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {`Load older context (${pivotAiIndex + 1} hidden)`}
        </button>
      )}
      {contextMessages.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>(empty)</div>}
      {collapseEnabled &&
        historyCollapsed &&
        visibleMessageIndices.map((i) => {
          const m = contextMessages[i] as ContextMessageLike;
          return <MessageCard key={i} message={m} />;
        })}
      {!collapseEnabled &&
        contextMessages.map((m, i) => <MessageCard key={i} message={m as ContextMessageLike} />)}
      {collapseEnabled && !historyCollapsed && (
        <>
          {contextMessages.map((m, i) => (
            <React.Fragment key={i}>
              <MessageCard message={m as ContextMessageLike} />
              {i === pivotAiIndex && (
                <div style={{ textAlign: 'center', margin: '4px 0' }}>
                  <button
                    data-testid="obsui-context-toggle-hide"
                    onClick={() => setHistoryCollapsed(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#555',
                      fontSize: 10,
                      textDecoration: 'underline',
                      padding: '2px 6px',
                    }}
                  >
                    Hide previous
                  </button>
                </div>
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}

function MessageCard({ message }: { message: ContextMessageLike }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 12,
      }}
    >
      <div className="tracing-md" data-testid="obs-md" style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-word' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const isBlock = String(className || '').includes('language-') || String(children).includes('\n');
              return (
                <code
                  style={{
                    background: '#eaeef2',
                    padding: isBlock ? 8 : '2px 4px',
                    display: isBlock ? 'block' : 'inline',
                    borderRadius: 4,
                    fontSize: 11,
                    whiteSpace: 'pre-wrap',
                  }}
                  className={className}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre({ children }) {
              return <pre style={{ background: '#eaeef2', padding: 0, margin: 0, overflow: 'auto' }}>{children}</pre>;
            },
          }}
        >
          {String(message.content ?? '')}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default ContextView;
