import { z } from 'zod';

export const NixhubPackageSchema = z.object({
  name: z.string(),
  summary: z.string().optional(),
  releases: z
    .array(
      z.object({
        version: z.union([z.string(), z.number()]).optional(),
        last_updated: z.string().optional(),
        platforms_summary: z.string().optional(),
        outputs_summary: z.string().optional(),
        commit_hash: z.string().optional(),
        platforms: z
          .array(
            z.object({
              system: z.string().optional(),
              attribute_path: z.string().optional(),
              commit_hash: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export type NixhubPackageJSON = z.infer<typeof NixhubPackageSchema>;

export class NixhubClient {
  constructor(private readonly baseUrl = 'https://www.nixhub.io') {}

  async fetchPackage(pkg: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<NixhubPackageJSON> {
    const url = `${this.baseUrl}/packages/${encodeURIComponent(pkg)}?_data=routes%2F_nixhub.packages.%24pkg._index`;
    const json = await this.fetchJson(url, opts);
    const parsed = NixhubPackageSchema.safeParse(json);
    if (!parsed.success) {
      const err = new Error('nixhub_bad_json');
      (err as Error & { details?: unknown }).details = parsed.error.flatten();
      throw err;
    }
    return parsed.data;
  }

  private async fetchJson(url: string, opts: { signal?: AbortSignal; timeoutMs?: number }): Promise<unknown> {
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ac = new AbortController();
      const timeout = opts.timeoutMs ?? 600;
      const timer = setTimeout(() => ac.abort(), timeout);
      try {
        const signal = opts.signal
          ? this.composeSignals(opts.signal, ac.signal)
          : ac.signal;
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
        if ([502, 503, 504].includes(res.status)) throw new Error(`nixhub_${res.status}`);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`nixhub_status_${res.status}`);
          (err as Error & { status?: number; body?: string }).status = res.status;
          (err as Error & { status?: number; body?: string }).body = text;
          throw err;
        }
        return (await res.json()) as unknown;
      } catch (err) {
        lastErr = err;
        const shouldRetry = err instanceof Error && /nixhub_50[234]/.test(err.message);
        if (err instanceof Error && err.name === 'AbortError') {
          break;
        }
        if (attempt >= maxAttempts || !shouldRetry) break;
        await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  private composeSignals(primary: AbortSignal, secondary: AbortSignal): AbortSignal {
    if (primary.aborted) return primary;
    const controller = new AbortController();
    if (secondary.aborted) {
      controller.abort(secondary.reason);
      return controller.signal;
    }
    if (primary.aborted) {
      controller.abort(primary.reason);
      return controller.signal;
    }
    const abort = (reason?: unknown) => {
      if (!controller.signal.aborted) controller.abort(reason);
    };
    primary.addEventListener('abort', () => abort(primary.reason), { once: true });
    secondary.addEventListener('abort', () => abort(secondary.reason), { once: true });
    return controller.signal;
  }
}
