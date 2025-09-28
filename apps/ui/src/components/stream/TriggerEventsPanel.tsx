import React, { useMemo } from 'react';
import { useTriggerEvents } from '@/hooks/useTriggerEvents';

interface Props { nodeId: string }

export function TriggerEventsPanel({ nodeId }: Props) {
  const { items, threadId, setThreadId } = useTriggerEvents(nodeId);

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-muted-foreground">Trigger Events</div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">threadId</label>
        <input
          className="flex-1 rounded border border-border bg-background p-1 text-xs"
          placeholder="optional thread id filter"
          value={threadId || ''}
          onChange={(e) => setThreadId(e.target.value || undefined)}
        />
      </div>
      <div className="space-y-2 max-h-80 overflow-auto border rounded p-2">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground">No events yet.</div>
        ) : (
          items.map((item, idx) => <EventItem key={item.ts + ':' + idx} item={item} />)
        )}
      </div>
    </div>
  );
}

function EventItem({ item }: { item: { ts: number; threadId: string; messages: Array<{ content: string; info: Record<string, unknown> }> } }) {
  const first = item.messages[0];
  const ts = useMemo(() => new Date(item.ts).toLocaleString(), [item.ts]);
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded border border-border p-2 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] text-muted-foreground">{ts}</div>
          <div className="font-mono text-[10px]">thread: {item.threadId}</div>
          <div className="truncate">{first?.content}</div>
        </div>
        <button className="text-[10px] underline" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Info'}</button>
      </div>
      {open ? (
        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[10px]">
          {JSON.stringify(first?.info ?? {}, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
