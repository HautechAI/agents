export interface ErrorResponse {
  code: string;
  message: string;
  retriable: boolean;
}

const DEFAULT_ERROR_CODE = 'unknown_error';

type NormalizedInput = Partial<ErrorResponse> & { message?: string };

export const normalizeError = (
  input: unknown,
  options?: { defaultCode?: string; retriable?: boolean },
): ErrorResponse => {
  const defaultCode = options?.defaultCode ?? DEFAULT_ERROR_CODE;
  const defaultRetriable = options?.retriable ?? false;

  if (isErrorResponse(input)) {
    return {
      code: input.code,
      message: input.message,
      retriable: input.retriable,
    };
  }

  if (input instanceof Error) {
    return {
      code: input.name && input.name !== 'Error' ? input.name : defaultCode,
      message: input.message || defaultCode,
      retriable: defaultRetriable,
    };
  }

  if (typeof input === 'object' && input !== null) {
    const candidate = input as NormalizedInput;
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return {
        code: candidate.code,
        message: candidate.message,
        retriable: typeof candidate.retriable === 'boolean' ? candidate.retriable : defaultRetriable,
      };
    }
    if (typeof candidate.message === 'string') {
      return {
        code: defaultCode,
        message: candidate.message,
        retriable: defaultRetriable,
      };
    }
  }

  if (typeof input === 'string') {
    return {
      code: defaultCode,
      message: input,
      retriable: defaultRetriable,
    };
  }

  return {
    code: defaultCode,
    message: String(input),
    retriable: defaultRetriable,
  };
};

const isErrorResponse = (value: unknown): value is ErrorResponse => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ErrorResponse>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.retriable === 'boolean'
  );
};
