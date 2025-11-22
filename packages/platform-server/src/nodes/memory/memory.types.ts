export type MemoryScope = 'global' | 'perThread';

export type MemoryFilter = { nodeId: string; scope: MemoryScope; threadId?: string };

export interface MemoryEntry {
  nodeId: string;
  scope: MemoryScope;
  threadId: string;
  path: string;
  parentPath: string;
  depth: number;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface StatResult {
  kind: 'file' | 'dir' | 'none';
  size?: number;
}

export interface ListEntry {
  name: string;
  kind: 'file' | 'dir';
}
