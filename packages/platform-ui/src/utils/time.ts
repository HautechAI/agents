type TimestampInput = string | number | Date | null | undefined;

const JUST_NOW_THRESHOLD_SECONDS = 5;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function toDate(value: TimestampInput): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

export function formatRelativeTimeShort(value: TimestampInput, nowInput: TimestampInput = Date.now()): string {
  const target = toDate(value);
  const now = toDate(nowInput);
  if (!target || !now) return 'Unknown time';

  const diffMs = now.getTime() - target.getTime();
  const absDiffMs = Math.abs(diffMs);

  if (absDiffMs <= JUST_NOW_THRESHOLD_SECONDS * SECOND) {
    return diffMs >= 0 ? 'just now' : 'in moments';
  }

  if (absDiffMs < MINUTE) {
    const seconds = Math.round(absDiffMs / SECOND);
    return diffMs >= 0 ? `${seconds}s ago` : `in ${seconds}s`;
  }

  if (absDiffMs < HOUR) {
    const minutes = Math.round(absDiffMs / MINUTE);
    return diffMs >= 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }

  if (absDiffMs < DAY) {
    const hours = Math.round(absDiffMs / HOUR);
    return diffMs >= 0 ? `${hours}h ago` : `in ${hours}h`;
  }

  const days = Math.round(absDiffMs / DAY);
  return diffMs >= 0 ? `${days}d ago` : `in ${days}d`;
}

export function formatAbsoluteTimestamp(value: TimestampInput, locale = 'en-US'): string {
  const date = toDate(value);
  if (!date) return 'Unknown time';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function computeDurationMs({
  startedAt,
  endedAt,
  durationMs,
}: {
  startedAt?: TimestampInput;
  endedAt?: TimestampInput;
  durationMs?: number | null;
}, nowInput: TimestampInput = Date.now(), options?: { fallbackToNow?: boolean }): number | null {
  const fallbackToNow = options?.fallbackToNow ?? true;
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    return Math.max(0, durationMs);
  }

  const start = toDate(startedAt);
  if (!start) return null;

  const end = toDate(endedAt);
  if (!end) {
    if (!fallbackToNow) return null;
    const now = toDate(nowInput);
    if (!now) return null;
    const diffNow = now.getTime() - start.getTime();
    return diffNow >= 0 ? diffNow : null;
  }

  const diff = end.getTime() - start.getTime();
  return diff >= 0 ? diff : null;
}

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < SECOND) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < MINUTE) {
    const seconds = ms / SECOND;
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }
  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = Math.round((ms % MINUTE) / SECOND);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}
