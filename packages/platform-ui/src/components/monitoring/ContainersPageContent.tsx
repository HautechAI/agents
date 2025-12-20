import type { ContainerStatus } from '@/components/screens/ContainersScreen';
import type { ContainerViewModel } from '@/features/monitoring/containers/types';
import ContainersScreen from '../screens/ContainersScreen';

type StatusCounts = {
  running: number;
  stopped: number;
  starting: number;
  stopping: number;
  all: number;
};

type ContainersPageContentProps = {
  containers: ContainerViewModel[];
  isLoading: boolean;
  status: ContainerStatus | 'all';
  counts: StatusCounts;
  onStatusChange: (status: ContainerStatus | 'all') => void;
  error: Error | null;
  onRetry?: () => void;
  onOpenTerminal?: (containerId: string) => void;
  onDeleteContainer?: (containerId: string) => void;
  onViewThread?: (threadId: string) => void;
};

export function ContainersPageContent({
  containers,
  isLoading,
  status,
  counts,
  onStatusChange,
  error,
  onRetry,
  onOpenTerminal,
  onDeleteContainer,
  onViewThread,
}: ContainersPageContentProps) {
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--agyn-bg-light)]">
        <div className="text-sm text-[var(--agyn-status-failed)]">{error.message}</div>
        {onRetry && (
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-[var(--agyn-blue)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--agyn-blue-dark)]"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <ContainersScreen
      containers={containers}
      statusFilter={status}
      counts={counts}
      onStatusFilterChange={onStatusChange}
      isLoading={isLoading}
      onOpenTerminal={onOpenTerminal}
      onDeleteContainer={onDeleteContainer}
      onViewThread={onViewThread}
    />
  );
}
