type ObsMode = 'extended' | 'otlp';
interface InitConfig {
    mode: ObsMode;
    endpoints: {
        extended?: string;
        otlp?: string;
    };
    batching?: {
        maxBatchSize?: number;
        flushIntervalMs?: number;
    };
    sampling?: {
        rate?: number;
    };
    defaultAttributes?: Record<string, unknown>;
    retry?: {
        maxRetries?: number;
        baseMs?: number;
        maxMs?: number;
        jitter?: boolean;
    };
}
interface SpanInput {
    label: string;
    attributes?: Record<string, unknown>;
    nodeId?: string;
    threadId?: string;
}
interface SpanContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
}
type InternalConfig = {
    mode: ObsMode;
    endpoints: {
        extended: string;
        otlp: string;
    };
    batching: {
        maxBatchSize: number;
        flushIntervalMs: number;
    };
    sampling: {
        rate: number;
    };
    defaultAttributes: Record<string, unknown>;
    retry: {
        maxRetries: number;
        baseMs: number;
        maxMs: number;
        jitter: boolean;
    };
};
declare function init(c: InitConfig): InternalConfig;
declare function withSpan<T>(input: SpanInput, fn: () => Promise<T> | T): Promise<T>;
declare function currentSpan(): SpanContext | undefined;
declare function flush(): Promise<void>;

export { type InitConfig, type ObsMode, type SpanContext, type SpanInput, currentSpan, flush, init, withSpan };
