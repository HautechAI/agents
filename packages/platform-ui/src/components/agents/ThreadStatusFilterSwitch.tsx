
export type ThreadStatusFilter = 'open' | 'closed' | 'all';

const labelForValue = (value: ThreadStatusFilter): string => {
  if (value === 'closed') return 'Resolved';
  if (value === 'open') return 'Open';
  return 'All';
};

export function ThreadStatusFilterSwitch({ value, onChange }: { value: ThreadStatusFilter; onChange: (v: ThreadStatusFilter) => void }) {
  const opts: ThreadStatusFilter[] = ['open', 'closed', 'all'];
  return (
    <div role="group" aria-label="Thread status filter" className="inline-flex rounded border overflow-hidden text-sm">
      {opts.map((v, idx) => (
        <button
          key={v}
          type="button"
          className={`px-3 py-1 ${value === v ? 'bg-gray-200 font-medium' : 'bg-white hover:bg-gray-50'} ${idx !== 0 ? 'border-l' : ''}`}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {labelForValue(v)}
        </button>
      ))}
    </div>
  );
}
