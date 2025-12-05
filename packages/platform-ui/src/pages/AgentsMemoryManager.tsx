import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { memoryApi, type MemoryDocItem } from '@/api/modules/memory';
import { MemoryManager } from '@/components/screens/memoryManager/MemoryManager';
import type { MemoryNode, MemoryTree } from '@/components/screens/memoryManager/utils';
import { normalizePath } from '@/components/screens/memoryManager/utils';

type MemoryCell = {
  key: string;
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  label: string;
};

type DumpResponse = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  data: Record<string, string>;
  dirs: Record<string, true>;
};

type TreeDiff =
  | { type: 'create'; cellKey: string; docPath: string }
  | { type: 'delete'; cellKey: string; docPath: string }
  | { type: 'update'; cellKey: string; docPath: string; oldContent: string; newContent: string };

const ROOT_PATH = '/';

function buildCellKey(item: MemoryDocItem): string {
  if (item.scope === 'perThread') {
    return item.threadId ? `${item.nodeId}__thread__${item.threadId}` : `${item.nodeId}__perThread`;
  }
  return `${item.nodeId}__global`;
}

function buildCellLabel(item: MemoryDocItem): string {
  if (item.scope === 'perThread') {
    return item.threadId ? `${item.nodeId} • ${item.threadId}` : `${item.nodeId} • per-thread`;
  }
  return `${item.nodeId}`;
}

function getParentMemoryPath(path: string): string | null {
  const normalized = normalizePath(path);
  if (normalized === ROOT_PATH) return null;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 1) return ROOT_PATH;
  segments.pop();
  return `/${segments.join('/')}`;
}

function splitTreePath(path: string): { cellKey: string; docPath: string } | null {
  const normalized = normalizePath(path);
  if (normalized === ROOT_PATH) return null;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const [cellKey, ...rest] = segments;
  const docPath = rest.length === 0 ? ROOT_PATH : `/${rest.join('/')}`;
  return { cellKey, docPath };
}

function flattenTree(node: MemoryNode, map: Map<string, MemoryNode> = new Map()): Map<string, MemoryNode> {
  map.set(node.path, node);
  for (const child of node.children) flattenTree(child, map);
  return map;
}

function collectAllPaths(dump?: DumpResponse): Set<string> {
  const paths = new Set<string>();
  if (!dump) return paths;
  for (const key of Object.keys(dump.data ?? {})) {
    paths.add(normalizePath(key));
  }
  for (const key of Object.keys(dump.dirs ?? {})) {
    paths.add(normalizePath(key));
  }
  const queue = Array.from(paths);
  for (const current of queue) {
    let parent = getParentMemoryPath(current);
    while (parent && parent !== ROOT_PATH && !paths.has(parent)) {
      paths.add(parent);
      queue.push(parent);
      parent = getParentMemoryPath(parent);
    }
  }
  return paths;
}

function buildCellTree(cell: MemoryCell, dump?: DumpResponse): MemoryTree {
  const basePath = `/${cell.key}`;
  const rootNode: MemoryTree = {
    id: basePath,
    path: basePath,
    name: cell.label,
    content: dump?.data?.[ROOT_PATH] ?? '',
    children: [],
  };

  const allPaths = collectAllPaths(dump);
  if (allPaths.size === 0) {
    return rootNode;
  }

  const nodeByPath = new Map<string, MemoryNode>();
  for (const memoryPath of allPaths) {
    if (memoryPath === ROOT_PATH) continue;
    const segment = memoryPath.split('/').filter(Boolean).pop() ?? ROOT_PATH;
    nodeByPath.set(memoryPath, {
      id: `${cell.key}:${memoryPath}`,
      path: `${basePath}${memoryPath}`,
      name: segment,
      content: dump?.data?.[memoryPath] ?? '',
      children: [],
    });
  }

  const childrenMap = new Map<string, MemoryNode[]>();
  for (const [memoryPath, node] of nodeByPath.entries()) {
    const parentPath = getParentMemoryPath(memoryPath) ?? ROOT_PATH;
    const list = childrenMap.get(parentPath) ?? [];
    list.push(node);
    childrenMap.set(parentPath, list);
  }

  for (const [, list] of childrenMap.entries()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  for (const [memoryPath, node] of nodeByPath.entries()) {
    node.children = childrenMap.get(memoryPath) ?? [];
  }

  rootNode.children = childrenMap.get(ROOT_PATH) ?? [];
  return rootNode;
}

function diffTrees(previous: MemoryTree | null, next: MemoryTree): TreeDiff | null {
  if (!previous) return null;
  const prevMap = flattenTree(previous, new Map());
  const nextMap = flattenTree(next, new Map());

  const filterDocPaths = (paths: string[], opts?: { allowRoot?: boolean }) =>
    paths.filter((path) => {
      const meta = splitTreePath(path);
      if (!meta) return false;
      if (meta.docPath === ROOT_PATH && !opts?.allowRoot) return false;
      return true;
    });

  const addedPaths = filterDocPaths(
    Array.from(nextMap.keys()).filter((path) => !prevMap.has(path)),
  );
  const removedPaths = filterDocPaths(
    Array.from(prevMap.keys()).filter((path) => !nextMap.has(path)),
  );
  const changedPaths = filterDocPaths(
    Array.from(nextMap.keys()).filter((path) => {
      if (!prevMap.has(path)) return false;
      const prevNode = prevMap.get(path)!;
      const nextNode = nextMap.get(path)!;
      return prevNode.content !== nextNode.content;
    }),
    { allowRoot: true },
  );

  if (addedPaths.length === 1 && removedPaths.length === 0 && changedPaths.length === 0) {
    const target = splitTreePath(addedPaths[0]);
    if (!target) return null;
    return { type: 'create', cellKey: target.cellKey, docPath: target.docPath };
  }

  if (removedPaths.length === 1 && addedPaths.length === 0 && changedPaths.length === 0) {
    const target = splitTreePath(removedPaths[0]);
    if (!target) return null;
    return { type: 'delete', cellKey: target.cellKey, docPath: target.docPath };
  }

  if (changedPaths.length === 1 && addedPaths.length === 0 && removedPaths.length === 0) {
    const targetPath = changedPaths[0];
    const target = splitTreePath(targetPath);
    if (!target) return null;
    const prevNode = prevMap.get(targetPath)!;
    const nextNode = nextMap.get(targetPath)!;
    return {
      type: 'update',
      cellKey: target.cellKey,
      docPath: target.docPath,
      oldContent: prevNode.content ?? '',
      newContent: nextNode.content ?? '',
    };
  }

  return null;
}

export function AgentsMemoryManager() {
  const queryClient = useQueryClient();
  const docsQuery = useQuery({
    queryKey: ['memory/docs'],
    queryFn: () => memoryApi.listDocs(),
    staleTime: 30_000,
  });

  const cells = useMemo<MemoryCell[]>(() => {
    const items = docsQuery.data?.items ?? [];
    const filtered = items.filter((item) => item.scope === 'global' || Boolean(item.threadId));
    filtered.sort((a, b) => {
      const labelA = buildCellLabel(a);
      const labelB = buildCellLabel(b);
      return labelA.localeCompare(labelB);
    });
    return filtered.map((item) => ({
      key: buildCellKey(item),
      nodeId: item.nodeId,
      scope: item.scope,
      threadId: item.threadId,
      label: buildCellLabel(item),
    }));
  }, [docsQuery.data]);

  const cellByKey = useMemo(() => new Map(cells.map((cell) => [cell.key, cell] as const)), [cells]);

  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);

  useEffect(() => {
    if (cells.length === 0) {
      setSelectedCellKey(null);
      return;
    }
    if (!selectedCellKey || !cellByKey.has(selectedCellKey)) {
      setSelectedCellKey(cells[0]?.key ?? null);
    }
  }, [cells, cellByKey, selectedCellKey]);

  const selectedCell = selectedCellKey ? cellByKey.get(selectedCellKey) ?? null : null;

  const storedPathsRef = useRef<Map<string, string>>(new Map());
  const [activePath, setActivePath] = useState<string>(ROOT_PATH);

  useEffect(() => {
    if (!selectedCellKey) return;
    const stored = storedPathsRef.current.get(selectedCellKey) ?? `/${selectedCellKey}`;
    setActivePath(stored);
  }, [selectedCellKey]);

  const dumpQuery = useQuery<DumpResponse>({
    queryKey: selectedCell
      ? ['memory/dump', selectedCell.nodeId, selectedCell.scope, selectedCell.threadId ?? null]
      : ['memory/dump', 'none'],
    queryFn: async () => memoryApi.dump(selectedCell!.nodeId, selectedCell!.scope, selectedCell!.threadId) as Promise<DumpResponse>,
    enabled: Boolean(selectedCell),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const dumpsCacheRef = useRef<Map<string, DumpResponse>>(new Map());

  useEffect(() => {
    if (selectedCellKey && dumpQuery.data) {
      dumpsCacheRef.current.set(selectedCellKey, dumpQuery.data);
    }
  }, [selectedCellKey, dumpQuery.data]);

  const rootTree = useMemo<MemoryTree>(() => {
    const children = cells.map((cell) => {
      const dump = cell.key === selectedCellKey
        ? dumpQuery.data ?? dumpsCacheRef.current.get(cell.key)
        : dumpsCacheRef.current.get(cell.key);
      return buildCellTree(cell, dump);
    });
    children.sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: 'root',
      path: ROOT_PATH,
      name: ROOT_PATH,
      content: '',
      children,
    };
  }, [cells, selectedCellKey, dumpQuery.data]);

  const previousTreeRef = useRef<MemoryTree | null>(null);

  useEffect(() => {
    previousTreeRef.current = rootTree;
  }, [rootTree]);

  const [mutationStatus, setMutationStatus] = useState<'idle' | 'pending'>('idle');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleSelectPath = useCallback((path: string) => {
    setActivePath(path);
    const meta = splitTreePath(path);
    if (meta) {
      storedPathsRef.current.set(meta.cellKey, path);
    } else if (selectedCellKey) {
      storedPathsRef.current.set(selectedCellKey, `/${selectedCellKey}`);
    }
  }, [selectedCellKey]);

  const handleTreeChange = useCallback(
    async (nextTree: MemoryTree) => {
      const previous = previousTreeRef.current;
      const diff = diffTrees(previous, nextTree);
      previousTreeRef.current = nextTree;
      if (!diff) return;

      const cell = cellByKey.get(diff.cellKey);
      if (!cell) return;

      setMutationError(null);

      const queryKey = ['memory/dump', cell.nodeId, cell.scope, cell.threadId ?? null] as const;

      try {
        if (diff.type === 'update' && diff.oldContent === diff.newContent) {
          return;
        }
        setMutationStatus('pending');
        if (diff.type === 'create') {
          await memoryApi.ensureDir(cell.nodeId, cell.scope, cell.threadId, diff.docPath);
        } else if (diff.type === 'delete') {
          await memoryApi.delete(cell.nodeId, cell.scope, cell.threadId, diff.docPath);
        } else if (diff.type === 'update') {
          if (!diff.oldContent) {
            await memoryApi.append(cell.nodeId, cell.scope, cell.threadId, diff.docPath, diff.newContent);
          } else {
            await memoryApi.update(cell.nodeId, cell.scope, cell.threadId, diff.docPath, diff.oldContent, diff.newContent);
          }
        }
        await queryClient.invalidateQueries({ queryKey });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to persist memory change.';
        setMutationError(message);
        await queryClient.invalidateQueries({ queryKey });
      } finally {
        setMutationStatus('idle');
      }
    },
    [cellByKey, queryClient],
  );

  const isLoadingDocs = docsQuery.isLoading;
  const docsError = docsQuery.error as Error | null;
  const cellsEmpty = !isLoadingDocs && cells.length === 0;
  const isTreeLoading = Boolean(selectedCell) && dumpQuery.isLoading;
  const treeError = dumpQuery.error as Error | null;

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-border/60 px-6 py-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Agents / Memory</h1>
          <p className="text-sm text-muted-foreground">Inspect and edit agent memory documents.</p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {isLoadingDocs ? (
          <div className="p-6 text-sm text-muted-foreground">Loading memory cells…</div>
        ) : docsError ? (
          <div className="p-6 text-sm text-destructive" role="alert">
            {docsError.message || 'Failed to load memory cells.'}
          </div>
        ) : cellsEmpty ? (
          <div className="p-6 text-sm text-muted-foreground">No memory cells available.</div>
        ) : isTreeLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading memory tree…</div>
        ) : treeError ? (
          <div className="p-6 text-sm text-destructive" role="alert">
            {treeError.message || 'Failed to load memory tree.'}
          </div>
        ) : !selectedCell ? (
          <div className="p-6 text-sm text-muted-foreground">Select a memory cell to continue.</div>
        ) : (
          <div className="relative h-full">
            {mutationError ? (
              <div className="absolute left-1/2 top-4 z-20 w-[min(480px,90%)] -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive shadow-sm">
                {mutationError}
              </div>
            ) : null}
            {mutationStatus === 'pending' || dumpQuery.isRefetching ? (
              <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-muted/80 px-4 py-1 text-xs text-muted-foreground">
                Saving changes…
              </div>
            ) : null}
            <MemoryManager
              className="h-full"
              initialTree={rootTree}
              initialSelectedPath={activePath}
              onSelectPath={handleSelectPath}
              onTreeChange={handleTreeChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
