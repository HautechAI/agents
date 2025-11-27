import type { Response, ResponseUsage } from 'openai/resources/responses/responses.mjs';

type InputTokensDetails = ResponseUsage['input_tokens_details'];
type OutputTokensDetails = ResponseUsage['output_tokens_details'];

type UsageSnapshot = Readonly<{
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: Partial<InputTokensDetails>;
  output_tokens_details?: Partial<OutputTokensDetails>;
}>;

interface UsageCandidate {
  total_tokens?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  input_tokens_details?: unknown;
  output_tokens_details?: unknown;
}

interface CachedTokensCandidate {
  cached_tokens?: unknown;
}

interface ReasoningTokensCandidate {
  reasoning_tokens?: unknown;
}

export class ReasoningOnlyZeroUsageError extends Error {
  readonly rawResponse: Response;

  constructor(rawResponse: Response) {
    super('Received reasoning-only response with zero usage tokens');
    this.name = 'ReasoningOnlyZeroUsageError';
    this.rawResponse = rawResponse;
  }
}

export function validateReasoningOnlyZeroUsage(response: Response): void {
  if (isReasoningOnlyZeroUsage(response)) {
    throw new ReasoningOnlyZeroUsageError(response);
  }
}

function isReasoningOnlyZeroUsage(response: Response): boolean {
  return hasZeroUsage(response.usage) && outputIsReasoningOnly(response.output);
}

function hasZeroUsage(usage: Response['usage'] | null | undefined): usage is UsageSnapshot {
  if (!isUsageSnapshot(usage)) {
    return false;
  }

  const counts = [
    usage.total_tokens,
    usage.input_tokens,
    usage.output_tokens,
    usage.input_tokens_details?.cached_tokens,
    usage.output_tokens_details?.reasoning_tokens,
  ].filter(isFiniteNumber);

  if (!counts.length) {
    return false;
  }

  return counts.every((value) => value === 0);
}

function outputIsReasoningOnly(output: Response['output'] | null | undefined): boolean {
  if (!Array.isArray(output) || output.length === 0) {
    return false;
  }

  return output.every((item) => item?.type === 'reasoning');
}

function isUsageSnapshot(usage: Response['usage'] | null | undefined): usage is UsageSnapshot {
  if (usage === null || usage === undefined || typeof usage !== 'object') {
    return false;
  }

  const candidate = usage as UsageCandidate;

  if (!isFiniteNumber(candidate.total_tokens)) return false;
  if (!isFiniteNumber(candidate.input_tokens)) return false;
  if (!isFiniteNumber(candidate.output_tokens)) return false;

  const inputDetails = candidate.input_tokens_details;
  if (!isValidInputUsageDetails(inputDetails)) return false;

  const outputDetails = candidate.output_tokens_details;
  if (!isValidOutputUsageDetails(outputDetails)) return false;

  return true;
}

function isValidInputUsageDetails(
  details: unknown,
): details is UsageSnapshot['input_tokens_details'] {
  if (details === undefined) {
    return true;
  }

  if (details === null || typeof details !== 'object') {
    return false;
  }

  const value = (details as CachedTokensCandidate).cached_tokens;
  if (value === undefined) {
    return true;
  }

  return isFiniteNumber(value);
}

function isValidOutputUsageDetails(
  details: unknown,
): details is UsageSnapshot['output_tokens_details'] {
  if (details === undefined) {
    return true;
  }

  if (details === null || typeof details !== 'object') {
    return false;
  }

  const value = (details as ReasoningTokensCandidate).reasoning_tokens;
  if (value === undefined) {
    return true;
  }

  return isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
