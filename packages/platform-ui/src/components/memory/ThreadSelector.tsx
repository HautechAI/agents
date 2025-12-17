type ThreadSelectorProps = {
  threads: string[];
  value?: string | null;
  onChange: (threadId: string) => void;
};

export function ThreadSelector({ threads, value, onChange }: ThreadSelectorProps) {
  if (!threads.length) {
    return <div className="text-sm text-muted-foreground">No threads found</div>;
  }

  return (
    <div className="space-y-1">
      <label htmlFor="memory-thread-selector" className="text-sm font-medium">
        Thread
      </label>
      <select
        id="memory-thread-selector"
        className="w-full rounded-md border border-[var(--agyn-border-light)] bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)]"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          Select thread
        </option>
        {threads.map((threadId) => (
          <option key={threadId} value={threadId}>
            {threadId}
          </option>
        ))}
      </select>
    </div>
  );
}
