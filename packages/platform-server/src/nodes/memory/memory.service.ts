import { Inject, Injectable } from '@nestjs/common';
import type { EntryMutation, MemoryEntriesRepositoryPort } from './memory.repository';
import { PostgresMemoryEntriesRepository } from './memory.repository';
import type { ListEntry, MemoryFilter, MemoryScope, StatResult } from './memory.types';

const VALID_SEGMENT = /^[A-Za-z0-9_. -]+$/;

@Injectable()
export class MemoryService {
  constructor(@Inject(PostgresMemoryEntriesRepository) private readonly repo: MemoryEntriesRepositoryPort) {}

  normalizePath(rawPath: string, opts: { allowRoot?: boolean } = {}): string {
    const allowRoot = opts.allowRoot ?? false;
    if (rawPath == null) throw new Error('path is required');
    let p = String(rawPath);
    if (p.length === 0) {
      if (allowRoot) return '/';
      throw new Error('path is required');
    }
    p = p.replace(/\\+/g, '/');
    p = p.trim();
    if (p.length === 0) {
      if (allowRoot) return '/';
      throw new Error('path is required');
    }
    p = p.replace(/\/+/g, '/');
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/+/g, '/');
    if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/g, '');
    if (p === '') p = '/';
    if (p === '/' && allowRoot) return '/';
    if (p === '/' && !allowRoot) throw new Error('path is required');
    if (p.includes('..')) throw new Error('invalid path: ".." not allowed');
    if (p.includes('$')) throw new Error('invalid path: "$" not allowed');
    const segments = this.getSegments(p);
    for (const segment of segments) {
      if (!VALID_SEGMENT.test(segment)) throw new Error(`invalid path segment: ${segment}`);
    }
    return p;
  }

  async ensureIndexes(): Promise<void> {
    // Schema managed via migrations; nothing to do.
  }

  private getSegments(path: string): string[] {
    if (path === '/') return [];
    return path.slice(1).split('/');
  }

  private getDepth(path: string): number {
    if (path === '/') return 0;
    return this.getSegments(path).length;
  }

  private getParentPath(path: string): string {
    if (path === '/') return '/';
    const idx = path.lastIndexOf('/');
    if (idx <= 0) return '/';
    return path.slice(0, idx);
  }

  private buildFilter(nodeId: string, scope: MemoryScope, threadId?: string): MemoryFilter {
    if (scope === 'perThread') {
      if (!threadId || threadId.trim().length === 0) throw new Error('threadId required for perThread scope');
      return { nodeId, scope, threadId: threadId.trim() };
    }
    return { nodeId, scope };
  }

  private deriveMeta(path: string): { parentPath: string; depth: number } {
    return {
      parentPath: this.getParentPath(path),
      depth: this.getDepth(path),
    };
  }

  private combineEntries(files: ListEntry[], dirs: Set<string>): ListEntry[] {
    const dirEntries = Array.from(dirs)
      .filter((name) => name.length > 0)
      .map((name) => ({ name, kind: 'dir' as const }));
    return [...dirEntries, ...files];
  }

  private async ensureNotDirectory(filter: MemoryFilter, path: string): Promise<void> {
    const hasChildren = await this.repo.hasDescendants(filter, path);
    if (hasChildren) throw new Error('EISDIR: path is a directory');
  }

  private async mutateEntry<T>(
    filter: MemoryFilter,
    path: string,
    mutator: (entry: string | null) => Promise<EntryMutation<T>> | EntryMutation<T>,
  ): Promise<T> {
    const meta = this.deriveMeta(path);
    return this.repo.withEntry(filter, path, meta, async (current) => {
      const next = await mutator(current ? current.content : null);
      return next;
    });
  }

  private extractDirName(parentPath: string, base: string): string | null {
    if (!parentPath || parentPath === base) return null;
    if (base === '/') {
      if (!parentPath.startsWith('/')) return null;
      const trimmed = parentPath.slice(1);
      if (!trimmed) return null;
      return trimmed.split('/')[0] ?? null;
    }
    const prefix = `${base}/`;
    if (!parentPath.startsWith(prefix)) return null;
    const remainder = parentPath.slice(prefix.length);
    if (!remainder) return null;
    return remainder.split('/')[0] ?? null;
  }

  async ensureDir(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<void> {
    void this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path, { allowRoot: true });
    if (norm === '/') return;
    // Directories are virtual; validation only.
  }

  async stat(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<StatResult> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path, { allowRoot: true });
    if (norm === '/') return { kind: 'dir' };
    const entry = await this.repo.getEntry(filter, norm);
    if (entry) return { kind: 'file', size: Buffer.byteLength(entry.content) };
    const hasChildren = await this.repo.hasDescendants(filter, norm);
    if (hasChildren) return { kind: 'dir' };
    return { kind: 'none' };
  }

  async list(nodeId: string, scope: MemoryScope, threadId: string | undefined, rawPath: string = '/'): Promise<ListEntry[]> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(rawPath || '/', { allowRoot: true });
    if (norm !== '/') {
      const entry = await this.repo.getEntry(filter, norm);
      if (entry) throw new Error('ENOTDIR: path is a file');
    }
    const files = await this.repo.listFiles(filter, norm);
    const fileEntries = files.map((entry) => ({ name: this.getSegments(entry.path).slice(-1)[0], kind: 'file' as const }));
    const parentPaths = await this.repo.listDescendantParentPaths(filter, norm);
    const dirs = new Set<string>();
    for (const parentPath of parentPaths) {
      const name = this.extractDirName(parentPath, norm);
      if (name) dirs.add(name);
    }
    const combined = this.combineEntries(fileEntries, dirs);
    return combined.sort((a, b) => a.name.localeCompare(b.name));
  }

  async read(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<string> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path);
    const entry = await this.repo.getEntry(filter, norm);
    if (entry) return entry.content;
    const hasChildren = await this.repo.hasDescendants(filter, norm);
    if (hasChildren) throw new Error('EISDIR: path is a directory');
    throw new Error('ENOENT: file not found');
  }

  async append(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string, data: string): Promise<void> {
    if (typeof data !== 'string') throw new Error('append expects string data');
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path);
    const existing = await this.repo.getEntry(filter, norm);
    if (!existing) await this.ensureNotDirectory(filter, norm);
    await this.mutateEntry(filter, norm, async (current) => {
      const base = current ?? '';
      const needsSeparator = base.length > 0 && !base.endsWith('\n') && !data.startsWith('\n');
      const next = base.length === 0 ? data : base + (needsSeparator ? '\n' : '') + data;
      return { type: 'upsert', content: next };
    });
  }

  async update(
    nodeId: string,
    scope: MemoryScope,
    threadId: string | undefined,
    path: string,
    oldStr: string,
    newStr: string,
  ): Promise<number> {
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') throw new Error('update expects string args');
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path);
    const existing = await this.repo.getEntry(filter, norm);
    if (!existing) {
      const hasChildren = await this.repo.hasDescendants(filter, norm);
      if (hasChildren) throw new Error('EISDIR: path is a directory');
      throw new Error('ENOENT: file not found');
    }
    if (oldStr.length === 0) return 0;
    return this.mutateEntry(filter, norm, async (current) => {
      const value = current ?? '';
      const parts = value.split(oldStr);
      const count = parts.length - 1;
      if (count === 0) return { type: 'noop', result: 0 };
      const next = parts.join(newStr);
      return { type: 'upsert', content: next, result: count };
    });
  }

  async delete(nodeId: string, scope: MemoryScope, threadId: string | undefined, rawPath: string | undefined): Promise<{ files: number; dirs: number }> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(rawPath ?? '/', { allowRoot: true });
    const removed = await this.repo.deleteTree(filter, norm);
    const files = removed.length;
    const dirs = new Set<string>();
    for (const row of removed) {
      const ancestors = this.getAncestorDirs(row.path);
      for (const dir of ancestors) dirs.add(dir);
    }
    return { files, dirs: dirs.size };
  }

  private getAncestorDirs(path: string): string[] {
    const segments = this.getSegments(path);
    const dirs: string[] = [];
    for (let i = 1; i < segments.length; i += 1) {
      const dir = '/' + segments.slice(0, i).join('/');
      dirs.push(dir);
    }
    return dirs;
  }

  async getAll(nodeId: string, scope: MemoryScope, threadId: string | undefined): Promise<Record<string, string>> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const entries = await this.repo.listAll(filter);
    const out: Record<string, string> = {};
    for (const entry of entries) out[entry.path] = entry.content;
    return out;
  }

  async dump(
    nodeId: string,
    scope: MemoryScope,
    threadId: string | undefined,
  ): Promise<{ nodeId: string; scope: MemoryScope; threadId?: string; data: Record<string, string>; dirs: Record<string, true> }> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const entries = await this.repo.listAll(filter);
    const data: Record<string, string> = {};
    const dirSet = new Set<string>();
    for (const entry of entries) {
      data[entry.path] = entry.content;
      for (const dir of this.getAncestorDirs(entry.path)) dirSet.add(dir);
    }
    const dirs: Record<string, true> = {};
    for (const dir of dirSet) dirs[dir] = true;
    return { nodeId, scope, threadId: threadId ?? undefined, data, dirs };
  }

  forMemory(nodeId: string, scope: MemoryScope, threadId?: string) {
    return {
      list: (path = '/') => this.list(nodeId, scope, threadId, path),
      stat: (path: string) => this.stat(nodeId, scope, threadId, path),
      read: (path: string) => this.read(nodeId, scope, threadId, path),
      append: (path: string, data: string) => this.append(nodeId, scope, threadId, path, data),
      update: (path: string, oldStr: string, newStr: string) => this.update(nodeId, scope, threadId, path, oldStr, newStr),
      ensureDir: (path: string) => this.ensureDir(nodeId, scope, threadId, path),
      delete: (path: string) => this.delete(nodeId, scope, threadId, path),
      getAll: () => this.getAll(nodeId, scope, threadId),
      dump: () => this.dump(nodeId, scope, threadId),
    } as const;
  }
}
