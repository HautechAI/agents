import { ContainerEventType, ContainerStatus } from '@prisma/client';
import type { ContainerHealthStatus } from './container.registry';

export type ContainerEventReason =
  | 'ContainerCreated'
  | 'ContainerStarted'
  | 'ContainerRestarted'
  | 'ContainerStopped'
  | 'ContainerDestroyed'
  | 'HealthStatusHealthy'
  | 'HealthStatusUnhealthy'
  | 'HealthStatusStarting'
  | 'HealthStatusUnknown'
  | 'OOMKilled'
  | 'SIGTERM'
  | 'SIGKILL'
  | 'SIGINT'
  | 'ExitedNormally'
  | 'ExitedWithError';

export interface ContainerReasonContext {
  eventType: ContainerEventType;
  exitCode?: number | null;
  signal?: string | null;
  hadRecentOom?: boolean;
  health?: ContainerHealthStatus;
}

const OOM_EXIT_CODE = 137;
const SIGTERM_EXIT_CODE = 143;
const SIGINT_EXIT_CODE = 130;

const SIGNAL_TO_REASON: Record<string, ContainerEventReason> = {
  SIGTERM: 'SIGTERM',
  TERM: 'SIGTERM',
  '15': 'SIGTERM',
  SIGKILL: 'SIGKILL',
  KILL: 'SIGKILL',
  '9': 'SIGKILL',
  SIGINT: 'SIGINT',
  INT: 'SIGINT',
  '2': 'SIGINT',
};

const normalizeSignal = (signal?: string | null): string | undefined => {
  if (!signal) return undefined;
  return signal.trim().toUpperCase();
};

export function mapContainerEventReason(context: ContainerReasonContext): ContainerEventReason {
  const { eventType, exitCode, signal, hadRecentOom, health } = context;

  if (eventType === 'create') return 'ContainerCreated';
  if (eventType === 'start') return 'ContainerStarted';
  if (eventType === 'restart') return 'ContainerRestarted';
  if (eventType === 'stop') return 'ContainerStopped';
  if (eventType === 'destroy') return 'ContainerDestroyed';
  if (eventType === 'health_status') {
    switch (normalizeHealth(health)) {
      case 'healthy':
        return 'HealthStatusHealthy';
      case 'unhealthy':
        return 'HealthStatusUnhealthy';
      case 'starting':
        return 'HealthStatusStarting';
      default:
        return 'HealthStatusUnknown';
    }
  }

  if (eventType === 'oom') {
    return 'OOMKilled';
  }

  if (eventType === 'kill') {
    const normalized = normalizeSignal(signal);
    if (normalized && SIGNAL_TO_REASON[normalized]) {
      return SIGNAL_TO_REASON[normalized];
    }
    return 'ExitedWithError';
  }

  const code = typeof exitCode === 'number' ? exitCode : null;
  if (code === 0) return 'ExitedNormally';
  if (code === OOM_EXIT_CODE) {
    return hadRecentOom ? 'OOMKilled' : 'SIGKILL';
  }
  if (code === SIGTERM_EXIT_CODE) return 'SIGTERM';
  if (code === SIGINT_EXIT_CODE) return 'SIGINT';

  return 'ExitedWithError';
}

export function statusForEvent(
  eventType: ContainerEventType,
  reason: ContainerEventReason,
): ContainerStatus | undefined {
  switch (eventType) {
    case 'create':
    case 'start':
    case 'restart':
      return 'running';
    case 'stop':
      return 'stopped';
    case 'oom':
      return 'failed';
    case 'kill':
      return 'terminating';
    case 'die':
      if (reason === 'ExitedNormally' || reason === 'SIGTERM') {
        return 'stopped';
      }
      return 'failed';
    case 'destroy':
    case 'health_status':
      return undefined;
    default:
      return undefined;
  }
}

const normalizeHealth = (value?: ContainerHealthStatus): ContainerHealthStatus | undefined => {
  if (!value) return undefined;
  if (value === 'healthy' || value === 'unhealthy' || value === 'starting') return value;
  return undefined;
};
