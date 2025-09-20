interface StatusChipProps {
  status: string;
  connected: boolean;
}

export function StatusChip({ status, connected }: StatusChipProps) {
  const base = 'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium';
  if (status === 'error')
    return <span className={base + ' bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}>error</span>;
  if (status === 'connecting')
    return (
      <span className={base + ' bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}>connecting</span>
    );
  if (status === 'ready')
    return (
      <span className={base + ' bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}>
        {connected ? 'live' : 'disconnected'}
      </span>
    );
  return <span className={base + ' bg-muted text-foreground'}>idle</span>;
}
