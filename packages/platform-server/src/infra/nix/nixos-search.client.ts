import { Buffer } from 'node:buffer';
import { z } from 'zod';

type SearchClientOptions = {
  baseUrl?: string;
  schemaVersion?: number;
  username?: string;
  password?: string;
  timeoutMs?: number;
};

type ExecuteOptions = {
  signal?: AbortSignal;
};

const SearchHitSchema = z.object({
  _index: z.string(),
  _score: z.number().nullable(),
  _source: z.object({
    package_attr_name: z.string(),
    package_pversion: z.string().optional(),
    package_platforms: z.array(z.string()).optional(),
    package_system: z.string().optional(),
    package_pname: z.string().optional(),
  }),
});

const SearchResponseSchema = z.object({
  hits: z.object({
    hits: z.array(SearchHitSchema),
  }),
});

export type NixSearchHit = {
  attributePath: string;
  version?: string;
  pname?: string;
  platforms: string[];
  system?: string;
  commitHash?: string;
  score: number | null;
};

const DEFAULT_BASE_URL = 'https://search.nixos.org/backend';
const DEFAULT_USERNAME = 'aWVSALXpZv';
const DEFAULT_PASSWORD = 'X8gPHnzL52wFEekuxsfQ9cSh';
const DEFAULT_SCHEMA_VERSION = 44;

export class NixSearchClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly schemaVersion: number;
  private readonly timeoutMs: number;

  constructor(opts: SearchClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.username = opts.username ?? DEFAULT_USERNAME;
    this.password = opts.password ?? DEFAULT_PASSWORD;
    this.schemaVersion = opts.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
    this.timeoutMs = opts.timeoutMs ?? 600;
  }

  async findByAttribute(
    channel: string,
    attributePath: string,
    version?: string,
    opts: ExecuteOptions = {},
  ): Promise<NixSearchHit[]> {
    const filters: unknown[] = [
      { term: { type: 'package' } },
      { term: { package_attr_name: attributePath } },
    ];
    if (version) {
      filters.push({ term: { package_pversion: version } });
    }

    const body = {
      size: 15,
      query: {
        bool: {
          filter: filters,
        },
      },
    } satisfies Record<string, unknown>;

    return this.execute(channel, body, opts);
  }

  async searchByName(
    channel: string,
    name: string,
    opts: { version?: string; size?: number; signal?: AbortSignal } = {},
  ): Promise<NixSearchHit[]> {
    const filters: unknown[] = [{ term: { type: 'package' } }];
    if (opts.version) {
      filters.push({ term: { package_pversion: opts.version } });
    }

    const body = {
      size: opts.size ?? 25,
      query: {
        bool: {
          filter: filters,
          must: [
            {
              multi_match: {
                query: name,
                fields: ['package_attr_name.edge^2', 'package_pname', 'package_attr_name'],
                operator: 'and',
              },
            },
          ],
        },
      },
    } satisfies Record<string, unknown>;

    return this.execute(channel, body, { signal: opts.signal });
  }

  private async execute(channel: string, body: Record<string, unknown>, opts: ExecuteOptions): Promise<NixSearchHit[]> {
    const alias = this.buildAlias(channel);
    const url = `${this.baseUrl}/${alias}/_search`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let removeAbortListener: (() => void) | undefined;
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort(opts.signal.reason);
      else {
        const listener = () => controller.abort(opts.signal?.reason);
        opts.signal.addEventListener('abort', listener, { once: true });
        removeAbortListener = () => opts.signal?.removeEventListener('abort', listener);
      }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`nixos_search_status_${res.status}`);
        (err as Error & { status?: number; body?: string }).status = res.status;
        (err as Error & { status?: number; body?: string }).body = text;
        throw err;
      }

      const json = (await res.json()) as unknown;
      const parsed = SearchResponseSchema.safeParse(json);
      if (!parsed.success) {
        const err = new Error('nixos_search_bad_json');
        (err as Error & { issues?: unknown }).issues = parsed.error.flatten();
        throw err;
      }

      return parsed.data.hits.hits.map((hit) => ({
        attributePath: hit._source.package_attr_name,
        version: hit._source.package_pversion,
        pname: hit._source.package_pname,
        platforms: hit._source.package_platforms ?? [],
        system: hit._source.package_system,
        commitHash: extractCommit(hit._index),
        score: hit._score,
      }));
    } finally {
      clearTimeout(timeout);
      if (removeAbortListener) removeAbortListener();
    }
  }

  private buildAlias(channel: string): string {
    const normalized = normalizeChannel(channel);
    return `latest-${this.schemaVersion}-${normalized}`;
  }
}

function normalizeChannel(channel: string): string {
  const trimmed = channel.trim();
  if (/^nixpkgs-/i.test(trimmed)) {
    return trimmed.replace(/^nixpkgs-/i, 'nixos-');
  }
  if (/^\d{2}\.\d{2}$/.test(trimmed)) {
    return `nixos-${trimmed}`;
  }
  if (/^\d{2}\.\d{2}\.[0-9]+$/.test(trimmed)) {
    return `nixos-${trimmed}`;
  }
  return trimmed;
}

function extractCommit(indexName: string): string | undefined {
  const match = indexName.match(/([0-9a-f]{40})$/i);
  return match ? match[1] : undefined;
}
