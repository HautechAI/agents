import { mkdir, readFile, rename, unlink, writeFile, chmod, open } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as delay } from 'timers/promises';
import { z } from 'zod';

export interface StoredLiteLLMServiceToken {
  token: string;
  alias: string;
  team_id?: string;
  base_url?: string;
  created_at?: string;
}

const tokenSchema = z.object({
  token: z.string().min(1),
  alias: z.string().min(1),
  team_id: z.string().min(1).optional(),
  base_url: z.string().min(1).optional(),
  created_at: z.string().min(1).optional(),
});

export interface LiteLLMTokenStorePaths {
  tokenPath: string;
  lockPath: string;
}

export interface LiteLLMTokenStoreOptions {
  paths?: Partial<LiteLLMTokenStorePaths>;
  lockMaxAttempts?: number;
  lockBaseDelayMs?: number;
}

const DEFAULT_TOKEN_PATH = fileURLToPath(
  new URL('../../../config/secrets/litellm/service_token.json', import.meta.url),
);
const DEFAULT_LOCK_PATH = fileURLToPath(
  new URL('../../../config/secrets/litellm/service_token.lock', import.meta.url),
);

export class LiteLLMTokenStore {
  private readonly tokenPath: string;
  private readonly lockPath: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(options: LiteLLMTokenStoreOptions = {}) {
    const { paths, lockMaxAttempts = 40, lockBaseDelayMs = 50 } = options;
    this.tokenPath = paths?.tokenPath ?? DEFAULT_TOKEN_PATH;
    this.lockPath = paths?.lockPath ?? DEFAULT_LOCK_PATH;
    this.maxAttempts = lockMaxAttempts;
    this.baseDelayMs = lockBaseDelayMs;
  }

  get paths(): LiteLLMTokenStorePaths {
    return { tokenPath: this.tokenPath, lockPath: this.lockPath };
  }

  async read(): Promise<StoredLiteLLMServiceToken | undefined> {
    try {
      const raw = await readFile(this.tokenPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return tokenSchema.parse(parsed);
    } catch (error) {
      if (this.isNotFound(error)) return undefined;
      throw error;
    }
  }

  async write(record: StoredLiteLLMServiceToken): Promise<void> {
    tokenSchema.parse(record);
    await this.ensureDirectory();
    const tempPath = `${this.tokenPath}.${process.pid}.${Date.now()}.tmp`;
    const data = `${JSON.stringify(record, null, 2)}\n`;
    await writeFile(tempPath, data, { mode: 0o600, flag: 'w' });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.tokenPath);
    await chmod(this.tokenPath, 0o600);
  }

  async remove(): Promise<void> {
    try {
      await unlink(this.tokenPath);
    } catch (error) {
      if (this.isNotFound(error)) return;
      throw error;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureDirectory();
    const handle = await this.acquireLock();
    try {
      return await fn();
    } finally {
      await handle.close().catch(() => {});
      await unlink(this.lockPath).catch(() => {});
    }
  }

  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.tokenPath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private async acquireLock(): Promise<import('fs/promises').FileHandle> {
    const dir = dirname(this.lockPath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await open(this.lockPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR, 0o600);
      } catch (error) {
        if (!this.isAlreadyExists(error)) throw error;
        if (attempt === this.maxAttempts) {
          throw new Error('litellm_service_token_lock_timeout');
        }
        const sleep = this.baseDelayMs * attempt;
        await delay(sleep);
      }
    }
    throw new Error('litellm_service_token_lock_timeout');
  }

  private isNotFound(error: unknown): boolean {
    return Boolean((error as NodeJS.ErrnoException)?.code === 'ENOENT');
  }

  private isAlreadyExists(error: unknown): boolean {
    return Boolean((error as NodeJS.ErrnoException)?.code === 'EEXIST');
  }
}
