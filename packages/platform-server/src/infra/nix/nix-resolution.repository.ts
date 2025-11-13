import type { Collection, Db } from 'mongodb';
import type { LoggerService } from '../../core/services/logger.service';

export type NixResolutionSource = 'nixhub' | 'nixos-search-attr' | 'nixos-search-name' | 'repology' | 'async';

export type NixResolutionDoc = {
  name: string;
  version: string;
  system: string;
  channel: string;
  attributePath: string;
  commitHash: string;
  source: NixResolutionSource;
  resolvedAt: Date;
  expiresAt: Date;
};

export class NixResolutionRepository {
  private readonly collection: Collection<NixResolutionDoc>;

  constructor(db: Db, private readonly logger: LoggerService) {
    this.collection = db.collection<NixResolutionDoc>('nix_resolutions');
  }

  async ensureIndexes(): Promise<void> {
    try {
      await this.collection.createIndex({ name: 1, version: 1, system: 1, channel: 1 }, { unique: true, name: 'nix_resolutions_key' });
      await this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'nix_resolutions_ttl' });
    } catch (err) {
      this.logger.error('Failed to ensure nix_resolutions indexes', err);
      throw err;
    }
  }

  async findActive(
    params: { name: string; version: string; system: string; channels: string[] },
    now: Date,
  ): Promise<NixResolutionDoc | null> {
    if (!params.channels.length) return null;
    const docs = await this.collection
      .find({
        name: params.name,
        version: params.version,
        system: params.system,
        channel: { $in: params.channels },
        expiresAt: { $gt: now },
      })
      .project<NixResolutionDoc>({})
      .toArray();
    if (!docs.length) return null;
    const order = new Map<string, number>();
    params.channels.forEach((ch, idx) => order.set(ch, idx));
    docs.sort((a, b) => (order.get(a.channel) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.channel) ?? Number.MAX_SAFE_INTEGER));
    return docs[0] ?? null;
  }

  async upsert(entry: Omit<NixResolutionDoc, 'resolvedAt' | 'expiresAt'>, ttlMs: number): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    await this.collection.updateOne(
      { name: entry.name, version: entry.version, system: entry.system, channel: entry.channel },
      {
        $set: {
          attributePath: entry.attributePath,
          commitHash: entry.commitHash,
          source: entry.source,
          resolvedAt: now,
          expiresAt,
        },
      },
      { upsert: true },
    );
  }
}
