import type { RunTimelineEvent } from '@/api/types/agents';

type RecordLike = Record<string, unknown>;

const coerceRecord = (value: unknown): RecordLike | null => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return null;
  return value as RecordLike;
};

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return value;
  }
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const extractTextFromRawResponse = (raw: unknown, options?: { ignoreMessage?: boolean }): string | null => {
  const ignoreMessage = options?.ignoreMessage === true;
  const visited = new WeakSet<object>();

  const extract = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? value : null;
    }

    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (const item of value) {
        const text = extract(item);
        if (typeof text === 'string' && text.length > 0) {
          parts.push(text);
        }
      }
      if (parts.length > 0) {
        return parts.join('\n\n');
      }
      return null;
    }

    const record = coerceRecord(value);
    if (!record) return null;
    if (visited.has(record)) return null;
    visited.add(record);

    const directKeys: Array<keyof RecordLike> = ['content', 'text', 'output_text', 'outputText'];
    for (const key of directKeys) {
      if (key in record) {
        const text = extract(record[key]);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    if (!ignoreMessage) {
      if ('message' in record) {
        const text = extract((record as RecordLike).message);
        if (typeof text === 'string' && text.length > 0) return text;
      }

      if ('messages' in record) {
        const text = extract((record as RecordLike).messages);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    const arrayKeys: Array<keyof RecordLike> = ['choices', 'outputs', 'output', 'responses'];
    for (const key of arrayKeys) {
      if (Array.isArray(record[key])) {
        for (const entry of record[key] as unknown[]) {
          const text = extract(entry);
          if (typeof text === 'string' && text.length > 0) return text;
        }
      }
    }

    if ('delta' in record) {
      const text = extract((record as RecordLike).delta);
      if (typeof text === 'string' && text.length > 0) return text;
    }

    const nestedKeys: Array<keyof RecordLike> = ['data', 'body', 'result', 'response', 'value'];
    for (const key of nestedKeys) {
      if (key in record) {
        const text = extract(record[key]);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    return null;
  };

  return extract(raw);
};

export const extractLlmResponse = (event: RunTimelineEvent): string => {
  if (isNonEmptyString(event.errorMessage)) {
    return event.errorMessage;
  }

  const llmCall = event.llmCall;
  if (!llmCall) return '';

  const responseText = llmCall.responseText;
  if (isNonEmptyString(responseText)) return responseText;

  const rawResponse = llmCall.rawResponse;
  if (rawResponse !== null && rawResponse !== undefined) {
    if (typeof rawResponse === 'string') {
      const trimmed = rawResponse.trim();
      if (trimmed.length > 0) return trimmed;
    }

    const record = coerceRecord(rawResponse);
    if (record) {
      const candidateKeys: Array<keyof RecordLike> = ['output', 'outputs', 'responses', 'choices', 'result', 'response', 'value'];
      for (const key of candidateKeys) {
        if (!(key in record)) continue;
        const text = extractTextFromRawResponse(record[key], { ignoreMessage: key !== 'choices' });
        if (isNonEmptyString(text)) return text;
      }
    }

    const rawText = extractTextFromRawResponse(rawResponse, { ignoreMessage: true });
    if (isNonEmptyString(rawText)) return rawText;
  }

  if (Array.isArray(event.attachments)) {
    for (const attachment of event.attachments) {
      if (!attachment || attachment.kind !== 'response') continue;

      const candidates: unknown[] = [];
      if (attachment.contentText !== undefined && attachment.contentText !== null) {
        const parsedText = typeof attachment.contentText === 'string' ? parseMaybeJson(attachment.contentText) : attachment.contentText;
        candidates.push(parsedText);
      }
      if (attachment.contentJson !== undefined && attachment.contentJson !== null) {
        const parsedJson = typeof attachment.contentJson === 'string' ? parseMaybeJson(attachment.contentJson) : attachment.contentJson;
        candidates.push(parsedJson);
      }

      for (const candidate of candidates) {
        const text = extractTextFromRawResponse(candidate, { ignoreMessage: true });
        if (isNonEmptyString(text)) return text;
      }
    }
  }

  return '';
};

export const __testing__ = {
  extractTextFromRawResponse,
  extractLlmResponse,
};
