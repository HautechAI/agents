type NormalizedError = {
  message: string;
  details?: Record<string, unknown>;
};

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function extractMessage(input: unknown, fallback: string): string {
  if (typeof input === 'string') return input.trim() || fallback;
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint' || typeof input === 'symbol') {
    return String(input);
  }
  if (input instanceof Error) {
    return input.message?.trim() || input.name || fallback;
  }
  if (typeof input === 'object' && input) {
    const direct = pickString((input as { message?: unknown }).message);
    if (direct) return direct;
    const nested = (input as { error?: unknown }).error;
    if (typeof nested === 'string') return nested.trim() || fallback;
    if (typeof nested === 'object' && nested) {
      const nestedMsg = extractMessage(nested, fallback);
      if (nestedMsg && nestedMsg !== fallback) return nestedMsg;
    }
  }
  try {
    const json = JSON.stringify(input);
    if (json && json !== '{}') return json;
  } catch (_err) {
    // ignore serialization issues
  }
  return fallback;
}

export function normalizeError(err: unknown): NormalizedError {
  const fallback = 'unknown_error';
  const message = extractMessage(err, fallback);

  const details: Record<string, unknown> = {};
  if (err instanceof Error) {
    const name = pickString(err.name);
    if (name) details.name = name;
    const stack = pickString(err.stack);
    if (stack) details.stack = stack;
  } else if (typeof err === 'object' && err) {
    const name = pickString((err as { name?: unknown }).name);
    if (name) details.name = name;
    const stack = pickString((err as { stack?: unknown }).stack);
    if (stack) details.stack = stack;
  }

  return Object.keys(details).length ? { message, details } : { message };
}

