import type { Db } from 'mongodb';
import { LoggerService } from './logger.service';

export type MemoryScope = 'global' | 'perThread';

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} not implemented`);
    this.name = 'NotImplementedError';
  }
}

export class MemoryService {
  constructor(
    private db: Db,
    private logger: LoggerService,
    private opts: { nodeId: string; scope: MemoryScope; threadResolver: () => string | undefined },
  ) {}

  // Helpers
  private validatePath(path: string): void {
    if (!path || typeof path !== 'string') throw new Error('Invalid path');
    if (!path.startsWith('/')) throw new Error('Path must start with /');
    if (path.includes('..')) throw new Error('Path cannot contain ..');
  }

  private normalizePath(path: string): string {
    this.validatePath(path);
    const parts = path
      .split('/')
      .filter(Boolean)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return parts.join('.');
  }

  private ensureDocKey(): { nodeId: string; scope: MemoryScope; threadId?: string } {
    const { nodeId, scope, threadResolver } = this.opts;
    if (scope === 'global') return { nodeId, scope };
    const threadId = threadResolver();
    if (!threadId) throw new Error('threadId is required for perThread scope');
    return { nodeId, scope, threadId };
  }

  // API methods (to be implemented later)
  async read(_path: string): Promise<any> {
    throw new NotImplementedError('read');
  }

  async list(_path: string): Promise<string[]> {
    throw new NotImplementedError('list');
  }

  async append(_path: string, _data: any): Promise<void> {
    throw new NotImplementedError('append');
  }

  async update(_path: string, _oldData: any, _newData: any): Promise<void> {
    throw new NotImplementedError('update');
  }

  async delete(_path: string): Promise<void> {
    throw new NotImplementedError('delete');
  }

  async stat(_path: string): Promise<{ exists: boolean; isDir: boolean } | null> {
    throw new NotImplementedError('stat');
  }

  async ensureDir(_path: string): Promise<void> {
    throw new NotImplementedError('ensureDir');
  }

  // Expose helpers for tests
  _normalizePath(path: string) {
    return this.normalizePath(path);
  }
  _ensureDocKey() {
    return this.ensureDocKey();
  }
}
