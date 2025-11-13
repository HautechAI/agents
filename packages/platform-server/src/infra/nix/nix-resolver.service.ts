import { Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { ConfigService } from '../../core/services/config.service';
import { LoggerService } from '../../core/services/logger.service';
import { MongoService } from '../../core/services/mongo.service';
import { attributeFamilyCandidates } from './attribute-family';
import { NixhubClient, NixhubPackageSchema, type NixhubPackageJSON } from './nixhub.client';
import { NixSearchClient, type NixSearchHit } from './nixos-search.client';
import { NixResolutionRepository, type NixResolutionSource } from './nix-resolution.repository';
import { TimedLruCache } from './timed-lru';

export type NixResolverStrategy = 'nixhub' | 'fallback' | 'hybrid';

export interface ResolveRequest {
  name: string;
  version: string;
  system?: string;
  channels?: string[];
  signal?: AbortSignal;
}

export interface NixResolutionResult {
  attributePath: string;
  commitHash: string;
  channel: string;
  source: NixResolutionSource;
  fromCache: boolean;
}

export class NixResolverError extends Error {
  constructor(
    public readonly kind: 'not_found' | 'timeout' | 'upstream',
    message?: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message ?? kind);
  }
}

type CacheEntry = {
  attributePath: string;
  commitHash: string;
  channel: string;
  source: NixResolutionSource;
};

type NixhubPlatform = NonNullable<NonNullable<NixhubPackageJSON['releases']>[number]['platforms']>[number];

@Injectable()
export class NixResolverService {
  private readonly memoryCache: TimedLruCache<string, CacheEntry>;
  private readonly repository?: NixResolutionRepository;
  private readonly repoReady: Promise<void>;
  private readonly nixhubClient: NixhubClient;
  private readonly nixSearchClient: NixSearchClient;
  private readonly cacheTtlMs: number;
  private readonly resolverTimeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    mongo: MongoService,
  ) {
    const maxEntries = this.safeConfig(() => this.config.nixCacheMax, 500);
    this.cacheTtlMs = this.safeConfig(() => this.config.nixResolverCacheTtlMs, 7 * 24 * 60 * 60 * 1000);
    this.memoryCache = new TimedLruCache<string, CacheEntry>(maxEntries, this.cacheTtlMs);
    const db = typeof mongo?.getDb === 'function' ? mongo.getDb() : null;
    if (db) {
      this.repository = new NixResolutionRepository(db, this.logger);
      this.repoReady = this.repository.ensureIndexes().catch((err) => {
        this.logger.error('Failed creating nix resolver indexes', err);
        throw err;
      });
    } else {
      this.repository = undefined;
      this.repoReady = Promise.resolve();
      if (typeof this.logger?.debug === 'function') {
        this.logger.debug('NixResolver operating without persistent cache (mongo unavailable)');
      }
    }
    this.resolverTimeoutMs = this.safeConfig(() => this.config.nixResolverTimeoutMs, 600);
    this.nixhubClient = new NixhubClient();
    this.nixSearchClient = new NixSearchClient({ timeoutMs: this.resolverTimeoutMs });
  }

  async resolve(req: ResolveRequest): Promise<NixResolutionResult> {
    const name = req.name.trim();
    const version = req.version.trim();
    const system = req.system?.trim() || 'x86_64-linux';
    const defaultChannels = this.safeConfig(() => this.config.nixpkgsChannels, ['nixpkgs-unstable']);
    const channels = (req.channels && req.channels.length ? req.channels : defaultChannels).map((c) => c.trim()).filter(Boolean);

    if (!name) throw new NixResolverError('not_found', 'name_required');
    if (!version) throw new NixResolverError('not_found', 'version_required');

    const cacheKey = this.cacheKey({ name, version, system, channels });
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      this.logger.debug('NixResolver memory cache hit', { name, version, system, channel: cached.channel, source: cached.source });
      return { ...cached, fromCache: true };
    }

    await this.repoReady;

    if (this.repository) {
      const persisted = await this.repository.findActive({ name, version, system, channels }, new Date());
      if (persisted) {
        const entry: CacheEntry = {
          attributePath: persisted.attributePath,
          commitHash: persisted.commitHash,
          channel: persisted.channel,
          source: persisted.source,
        };
        this.memoryCache.set(cacheKey, entry);
        this.logger.debug('NixResolver persistent cache hit', { name, version, system, channel: entry.channel, source: entry.source });
        return { ...entry, fromCache: true };
      }
    }

    const start = performance.now();
    const budgetMs = this.safeConfig(() => this.config.nixResolverTotalBudgetMs, 1500);
    const strategy = this.safeConfig(() => this.config.nixResolverStrategy, 'hybrid' as const);
    const timeoutSignal = req.signal;

    const recordSuccess = async (result: CacheEntry) => {
      this.memoryCache.set(cacheKey, result);
      if (this.repository) {
        await this.repository.upsert({
          name,
          version,
          system,
          channel: result.channel,
          attributePath: result.attributePath,
          commitHash: result.commitHash,
          source: result.source,
        }, this.cacheTtlMs);
      }
      this.logger.info('NixResolver resolved', {
        name,
        version,
        system,
        channel: result.channel,
        source: result.source,
        durationMs: Number((performance.now() - start).toFixed(2)),
      });
      return { ...result, fromCache: false } satisfies NixResolutionResult;
    };

    const budgetCheck = () => {
      if (performance.now() - start > budgetMs) {
        throw new NixResolverError('timeout', 'resolver_budget_exceeded');
      }
    };

    const errors: unknown[] = [];

    if (strategy !== 'fallback') {
      budgetCheck();
      const nixhubResult = await this.tryNixhub({ name, version, system, channels, signal: timeoutSignal, budgetCheck }).catch((err) => {
        if (err instanceof NixResolverError && err.kind !== 'not_found') throw err;
        errors.push(err);
        return null;
      });
      if (nixhubResult && nixhubResult.kind === 'success') {
        return recordSuccess({
          attributePath: nixhubResult.attributePath,
          commitHash: nixhubResult.commitHash,
          channel: nixhubResult.channel,
          source: 'nixhub',
        });
      }
    }

    if (strategy !== 'nixhub') {
      budgetCheck();
      const searchResult = await this.tryNixSearch({ name, version, system, channels, signal: timeoutSignal, budgetCheck }).catch((err) => {
        if (err instanceof NixResolverError && err.kind !== 'not_found') throw err;
        errors.push(err);
        return null;
      });
      if (searchResult && searchResult.kind === 'success') {
        return recordSuccess({
          attributePath: searchResult.attributePath,
          commitHash: searchResult.commitHash,
          channel: searchResult.channel,
          source: searchResult.source,
        });
      }
    }

    this.logger.warn('NixResolver unresolved', { name, version, system, channels, errors: errors.map(stringifyError) });
    if (this.safeConfig(() => this.config.nixResolverEnableAsync, true)) {
      this.scheduleAsyncVerification({ name, version, system, channels }, errors);
    }
    throw new NixResolverError('not_found', 'resolution_not_found');
  }

  private cacheKey(input: { name: string; version: string; system: string; channels: string[] }): string {
    return `${input.name}::${input.version}::${input.system}::${input.channels.join(',')}`;
  }

  private async tryNixhub(args: {
    name: string;
    version: string;
    system: string;
    channels: string[];
    signal?: AbortSignal;
    budgetCheck: () => void;
  }): Promise<{ kind: 'success'; attributePath: string; commitHash: string; channel: string } | { kind: 'not_found' } | null> {
    const { name, version, system, channels, signal, budgetCheck } = args;
    try {
      budgetCheck();
      const pkg = await this.nixhubClient.fetchPackage(name, { signal, timeoutMs: this.resolverTimeoutMs });
      const parsed = NixhubPackageSchema.safeParse(pkg);
      if (!parsed.success) {
        throw new NixResolverError('upstream', 'nixhub_bad_json');
      }
      const release = parsed.data.releases?.find((rel) => String(rel.version ?? '') === version);
      if (!release) return { kind: 'not_found' };
      const platforms = (release.platforms ?? []) as NixhubPlatform[];
      const preferred = this.pickPreferredPlatform(platforms, system);
      const attributePath = preferred?.attribute_path;
      const commitHash = preferred?.commit_hash ?? release.commit_hash;
      if (!attributePath || !commitHash) {
        return null; // missing fields, fall back
      }
      return {
        kind: 'success',
        attributePath,
        commitHash,
        channel: channels[0] ?? 'nixpkgs-unstable',
      };
    } catch (err) {
      if (err instanceof NixResolverError) throw err;
      if (isAbortError(err)) throw new NixResolverError('timeout', 'nixhub_timeout', undefined, err);
      if (isStatusError(err, 404)) return { kind: 'not_found' };
      if (isStatusError(err, 502) || isStatusError(err, 503) || isStatusError(err, 504)) {
        throw new NixResolverError('upstream', 'nixhub_unavailable', err.status, err);
      }
      if (err instanceof Error && err.message?.startsWith('nixhub_bad_json')) {
        throw new NixResolverError('upstream', err.message, undefined, err);
      }
      throw err;
    }
  }

  private pickPreferredPlatform(platforms: NixhubPlatform[], system: string): NixhubPlatform | undefined {
    if (!platforms?.length) return undefined;
    const usable = (p: NixhubPlatform | undefined) => !!p?.attribute_path;
    const order = Array.from(new Set([system, 'x86_64-linux', 'aarch64-linux'].filter(Boolean)));
    for (const sys of order) {
      const match = platforms.find((p) => p?.system === sys && usable(p));
      if (match) return match;
    }
    return platforms.find((p) => usable(p));
  }

  private async tryNixSearch(args: {
    name: string;
    version: string;
    system: string;
    channels: string[];
    signal?: AbortSignal;
    budgetCheck: () => void;
  }): Promise<{ kind: 'success'; attributePath: string; commitHash: string; channel: string; source: Extract<NixResolutionSource, 'nixos-search-attr' | 'nixos-search-name'> } | { kind: 'not_found' }> {
    const { name, version, system, channels, signal, budgetCheck } = args;
    if (!channels.length) return { kind: 'not_found' };
    const attrCandidates = attributeFamilyCandidates(name, version);

    for (const channel of channels) {
      budgetCheck();
      for (const attr of attrCandidates) {
        const hits = await this.nixSearchClient
          .findByAttribute(channel, attr, version, { signal })
          .catch((err) => this.handleSearchError(err));
        if (!hits?.length) continue;
        const best = pickBestCandidate(hits, system, version, [attr]);
        if (best) {
          return {
            kind: 'success',
            attributePath: best.attributePath,
            commitHash: best.commitHash!,
            channel,
            source: 'nixos-search-attr',
          };
        }
      }

      budgetCheck();
      const nameHits = await this.nixSearchClient
        .searchByName(channel, name, { version, signal })
        .catch((err) => this.handleSearchError(err));
      if (nameHits?.length) {
        const best = pickBestCandidate(nameHits, system, version, attrCandidates);
        if (best) {
          return {
            kind: 'success',
            attributePath: best.attributePath,
            commitHash: best.commitHash!,
            channel,
            source: 'nixos-search-name',
          };
        }
      }
    }

    return { kind: 'not_found' };
  }

  private handleSearchError(err: unknown): NixSearchHit[] | null {
    if (isAbortError(err)) throw new NixResolverError('timeout', 'nixos_search_timeout', undefined, err);
    if (isStatusError(err, 404)) return null;
    if (isStatusError(err, 502) || isStatusError(err, 503) || isStatusError(err, 504)) {
      throw new NixResolverError('upstream', 'nixos_search_unavailable', err.status, err);
    }
    throw err;
  }

  private scheduleAsyncVerification(params: { name: string; version: string; system: string; channels: string[] }, errors: unknown[]) {
    this.logger.debug('NixResolver async verification scheduled', { ...params, errors: errors.map(stringifyError) });
    // Placeholder: actual async verification/backfill handled by future worker.
  }

  private safeConfig<T>(fn: () => T, fallback: T): T {
    try {
      const value = fn();
      return (value ?? fallback) as T;
    } catch {
      return fallback;
    }
  }
}

function isAbortError(err: unknown): err is { name: string } {
  return !!err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError';
}

function isStatusError(err: unknown, status: number): err is Error & { status: number } {
  return !!err && typeof err === 'object' && 'status' in err && (err as { status?: number }).status === status;
}

function pickBestCandidate(
  hits: NixSearchHit[] | null,
  desiredSystem: string,
  targetVersion: string,
  preferredAttrs: string[],
): NixSearchHit | null {
  if (!hits || !hits.length) return null;
  const cleanedVersion = normalizeVersion(targetVersion);
  const attrOrder = new Map(preferredAttrs.map((attr, idx) => [attr, idx]));

  const scored = hits
    .filter((hit) => !!hit.commitHash)
    .map((hit) => {
      const versionScore = versionsEqual(cleanedVersion, hit.version ?? '') ? 0 : 1;
      const attrScore = attrOrder.has(hit.attributePath) ? attrOrder.get(hit.attributePath)! : preferredAttrs.length + 1;
      let systemScore = 3;
      if (hit.system === desiredSystem) systemScore = 0;
      else if (hit.system && hit.system.endsWith('-linux')) systemScore = 1;
      else if (hit.platforms.includes(desiredSystem)) systemScore = 0;
      else if (hit.platforms.includes('aarch64-linux')) systemScore = 1;
      return { hit, versionScore, attrScore, systemScore };
    });

  if (!scored.length) return null;

  scored.sort((a, b) => {
    if (a.versionScore !== b.versionScore) return a.versionScore - b.versionScore;
    if (a.attrScore !== b.attrScore) return a.attrScore - b.attrScore;
    if (a.systemScore !== b.systemScore) return a.systemScore - b.systemScore;
    const aScore = a.hit.score ?? 0;
    const bScore = b.hit.score ?? 0;
    return bScore - aScore;
  });

  return scored[0]?.hit ?? null;
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, '');
}

function versionsEqual(left: string, right: string): boolean {
  const l = normalizeVersion(left);
  const r = normalizeVersion(right);
  return l === r;
}

function stringifyError(err: unknown): unknown {
  if (!err) return err;
  if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack, status: (err as { status?: number }).status };
  return err;
}
