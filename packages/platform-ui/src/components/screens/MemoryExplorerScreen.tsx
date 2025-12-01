import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Save, Plus, FilePlus2, FolderPlus, Trash2, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { MemoryTree } from '@/components/memory/MemoryTree';
import { MarkdownInput } from '@/components/MarkdownInput';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { Badge } from '@/components/Badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { memoryApi } from '@/api/modules/memory';
import { notifyError, notifySuccess } from '@/lib/notify';
import { joinMemoryPath, memoryPathParent, normalizeMemoryPath } from '@/components/memory/path';

interface MemoryExplorerScreenProps {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  initialPath?: string;
  className?: string;
  onPathChange?: (nextPath: string) => void;
  onThreadChange?: (threadId: string) => void;
}

type AppendIntent = 'append' | 'create';

interface AppendPayload {
  path: string;
  content: string;
  intent: AppendIntent;
}

interface EnsureLocationPayload {
  path: string;
  focusAfter?: boolean;
}

interface DeletePayload {
  path: string;
}

export default function MemoryExplorerScreen({
  nodeId,
  scope,
  threadId,
  initialPath,
  className = '',
  onPathChange,
  onThreadChange,
}: MemoryExplorerScreenProps) {
  const queryClient = useQueryClient();

  const requiresThread = scope === 'perThread';
  const trimmedThreadId = threadId?.trim() ?? '';
  const effectiveThreadId = requiresThread ? (trimmedThreadId.length > 0 ? trimmedThreadId : undefined) : threadId;
  const threadMissing = requiresThread && !effectiveThreadId;

  const [selectedPath, setSelectedPath] = useState(() => normalizeMemoryPath(initialPath ?? '/'));
  const selectedPathRef = useRef(selectedPath);
  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  const lastSyncedRef = useRef<{ path: string; content: string } | null>(null);

  const [editorValue, setEditorValue] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const resetEditor = useCallback(() => {
    setEditorValue('');
    setEditorDirty(false);
  }, []);

  const [appendValue, setAppendValue] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [newDocumentName, setNewDocumentName] = useState('');
  const [newDocumentContent, setNewDocumentContent] = useState('');

  const resetFormState = useCallback(() => {
    setAppendValue('');
    setNewLocationName('');
    setNewDocumentName('');
    setNewDocumentContent('');
  }, []);

  const focusPath = useCallback(
    (path: string, options: { notify?: boolean } = {}) => {
      const normalized = normalizeMemoryPath(path);
      const shouldNotify = options.notify ?? true;
      if (normalized === selectedPathRef.current) {
        if (shouldNotify) {
          onPathChange?.(normalized);
        }
        return;
      }

      selectedPathRef.current = normalized;
      setSelectedPath(normalized);
      lastSyncedRef.current = null;
      resetEditor();
      resetFormState();
      if (shouldNotify) {
        onPathChange?.(normalized);
      }
    },
    [onPathChange, resetEditor, resetFormState],
  );

  useEffect(() => {
    const next = normalizeMemoryPath(initialPath ?? '/');
    focusPath(next, { notify: false });
  }, [initialPath, nodeId, scope, effectiveThreadId, focusPath]);

  useEffect(() => {
    if (threadMissing) {
      focusPath('/', { notify: false });
    }
  }, [threadMissing, focusPath]);

  const [threadInput, setThreadInput] = useState(threadId ?? '');
  useEffect(() => {
    setThreadInput(threadId ?? '');
  }, [threadId]);

  const statQuery = useQuery({
    queryKey: ['memory/stat', nodeId, scope, effectiveThreadId ?? null, selectedPath],
    queryFn: () => memoryApi.stat(nodeId, scope, effectiveThreadId, selectedPath),
    enabled: !threadMissing,
    staleTime: 15_000,
  });

  const readQuery = useQuery({
    queryKey: ['memory/read', nodeId, scope, effectiveThreadId ?? null, selectedPath],
    queryFn: () => memoryApi.read(nodeId, scope, effectiveThreadId, selectedPath),
    enabled: !threadMissing,
    retry: false,
  });

  useEffect(() => {
    if (threadMissing) {
      lastSyncedRef.current = null;
      resetEditor();
      return;
    }

    if (readQuery.data) {
      const incoming = readQuery.data.content;
      const prev = lastSyncedRef.current;
      const path = selectedPathRef.current;
      const hasPathChanged = !prev || prev.path !== path;
      if (!editorDirty || hasPathChanged) {
        setEditorValue(incoming);
        setEditorDirty(false);
      }
      lastSyncedRef.current = { path, content: incoming };
    } else if (readQuery.isError) {
      const path = selectedPathRef.current;
      lastSyncedRef.current = { path, content: '' };
      if (!editorDirty) {
        resetEditor();
      }
    }
  }, [editorDirty, readQuery.data, readQuery.isError, threadMissing, resetEditor]);

  const invalidateTree = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['memory/list', nodeId, scope, effectiveThreadId ?? null] });
  }, [effectiveThreadId, nodeId, queryClient, scope]);

  const invalidatePathQueries = useCallback(
    (targetPath: string, options?: { includeRead?: boolean }) => {
      const normalized = normalizeMemoryPath(targetPath);
      queryClient.invalidateQueries({
        queryKey: ['memory/stat', nodeId, scope, effectiveThreadId ?? null, normalized],
      });
      if (options?.includeRead ?? true) {
        queryClient.invalidateQueries({
          queryKey: ['memory/read', nodeId, scope, effectiveThreadId ?? null, normalized],
        });
      }
    },
    [effectiveThreadId, nodeId, queryClient, scope],
  );

  const invalidateParentQueries = useCallback(
    (childPath: string) => {
      const normalizedChild = normalizeMemoryPath(childPath);
      const parentPath = memoryPathParent(normalizedChild);
      queryClient.invalidateQueries({
        queryKey: ['memory/stat', nodeId, scope, effectiveThreadId ?? null, parentPath],
      });
      const parentReadKey = ['memory/read', nodeId, scope, effectiveThreadId ?? null, parentPath] as const;
      if (queryClient.getQueryState(parentReadKey)) {
        queryClient.invalidateQueries({ queryKey: parentReadKey });
      }
    },
    [effectiveThreadId, nodeId, queryClient, scope],
  );

  const appendMutation = useMutation({
    mutationFn: async ({ path, content }: AppendPayload) => {
      const normalized = normalizeMemoryPath(path);
      return memoryApi.append(nodeId, scope, effectiveThreadId, normalized, content);
    },
    onSuccess: (_data, { path, content, intent }) => {
      const normalized = normalizeMemoryPath(path);
      invalidateTree();
      invalidatePathQueries(normalized);
      invalidateParentQueries(normalized);

      if (intent === 'append') {
        notifySuccess('Content appended');
        setAppendValue('');
      } else {
        notifySuccess('Document created');
        focusPath(normalized, { notify: true });
        setEditorValue(content);
        setEditorDirty(false);
        lastSyncedRef.current = { path: normalized, content };
        setNewDocumentName('');
        setNewDocumentContent('');
      }
    },
    onError: (error: unknown, { intent }) => {
      notifyError((error as Error)?.message || (intent === 'append' ? 'Failed to append content' : 'Failed to create document'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ oldContent, newContent }: { oldContent: string; newContent: string }) =>
      memoryApi.update(nodeId, scope, effectiveThreadId, selectedPathRef.current, oldContent, newContent),
    onSuccess: () => {
      notifySuccess('Document saved');
      setEditorDirty(false);
      const currentPath = selectedPathRef.current;
      invalidatePathQueries(currentPath);
      invalidateParentQueries(currentPath);
      lastSyncedRef.current = { path: currentPath, content: editorValue };
    },
    onError: (error: unknown) => {
      notifyError((error as Error)?.message || 'Failed to save document');
    },
  });

  const ensureDirMutation = useMutation({
    mutationFn: async ({ path }: EnsureLocationPayload) => {
      const normalized = normalizeMemoryPath(path);
      return memoryApi.ensureDir(nodeId, scope, effectiveThreadId, normalized);
    },
    onSuccess: (_data, { path, focusAfter }) => {
      const normalized = normalizeMemoryPath(path);
      notifySuccess('Location ensured');
      invalidateTree();
      invalidatePathQueries(normalized);
      invalidateParentQueries(normalized);
      setNewLocationName('');
      if (focusAfter) {
        focusPath(normalized, { notify: true });
      }
    },
    onError: (error: unknown) => {
      notifyError((error as Error)?.message || 'Failed to ensure location');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ path }: DeletePayload) => memoryApi.delete(nodeId, scope, effectiveThreadId, normalizeMemoryPath(path)),
    onSuccess: (_data, { path }) => {
      const normalized = normalizeMemoryPath(path);
      notifySuccess('Location deleted');
      invalidateTree();
      invalidatePathQueries(normalized);
      invalidateParentQueries(normalized);
      const parent = memoryPathParent(normalized);
      focusPath(parent, { notify: true });
    },
    onError: (error: unknown) => {
      notifyError((error as Error)?.message || 'Failed to delete path');
    },
  });

  const documentExists = statQuery.data?.exists ?? false;
  const documentHasSubdocs = statQuery.data?.hasSubdocs ?? false;
  const documentLength = statQuery.data?.contentLength ?? 0;

  const documentStatus = useMemo(() => {
    if (statQuery.isLoading) return 'Loading path…';
    if (statQuery.error) return 'Failed to load path info';
    if (!documentExists) return 'Missing document';
    if (documentHasSubdocs && documentLength > 0) return 'Document with subdocuments';
    if (documentHasSubdocs) return 'Location with subdocuments';
    return 'Document';
  }, [documentExists, documentHasSubdocs, documentLength, statQuery.error, statQuery.isLoading]);

  const readBusy = readQuery.isLoading || readQuery.isFetching;
  const saveDisabled = threadMissing || !documentExists || updateMutation.isPending || readBusy || readQuery.isError || !editorDirty;
  const appendDisabled = threadMissing || appendMutation.isPending || appendValue.trim().length === 0;
  const createLocationDisabled = threadMissing || ensureDirMutation.isPending || newLocationName.trim().length === 0;
  const createDocumentDisabled = threadMissing || appendMutation.isPending || newDocumentName.trim().length === 0 || newDocumentContent.trim().length === 0;
  const deleteDisabled = threadMissing || deleteMutation.isPending || selectedPathRef.current === '/';

  const handleEditorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setEditorValue(event.target.value);
    setEditorDirty(true);
  };

  const handleAppend = () => {
    if (appendDisabled) return;
    appendMutation.mutate({ path: selectedPathRef.current, content: appendValue, intent: 'append' });
  };

  const handleCreateDocument = () => {
    if (createDocumentDisabled) return;
    const trimmedName = newDocumentName.trim();
    const targetPath = joinMemoryPath(selectedPathRef.current, trimmedName);
    appendMutation.mutate({ path: targetPath, content: newDocumentContent, intent: 'create' });
  };

  const handleCreateLocation = (focusAfter: boolean) => {
    if (createLocationDisabled) return;
    const trimmedName = newLocationName.trim();
    const targetPath = joinMemoryPath(selectedPathRef.current, trimmedName);
    ensureDirMutation.mutate({ path: targetPath, focusAfter });
  };

  const handleDelete = () => {
    if (deleteDisabled) return;
    deleteMutation.mutate({ path: selectedPathRef.current });
  };

  const handleThreadSubmit = useCallback(() => {
    if (!onThreadChange) return;
    onThreadChange(threadInput.trim());
  }, [onThreadChange, threadInput]);

  const handleThreadKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleThreadSubmit();
    }
  };

  const refetchPath = () => {
    statQuery.refetch();
    readQuery.refetch();
  };

  const renderThreadSelector = () => {
    if (scope !== 'perThread') return null;

    return (
      <div className="mt-4 space-y-2">
        <div className="text-sm font-medium text-[var(--agyn-dark)]">Thread</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={threadInput}
            onChange={(event) => setThreadInput(event.target.value)}
            onKeyDown={handleThreadKeyDown}
            placeholder="Enter thread ID"
            className="w-full max-w-sm"
            disabled={!onThreadChange}
          />
          {onThreadChange ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleThreadSubmit}
              disabled={threadInput.trim() === trimmedThreadId && !!trimmedThreadId}
            >
              Apply
            </Button>
          ) : null}
        </div>
        {threadMissing ? (
          <div className="text-xs text-[var(--agyn-status-failed)]">
            Select a thread to enable memory operations.
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`flex h-full flex-col bg-white ${className}`}>
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Memory Explorer</h1>
              <Badge variant={scope === 'global' ? 'primary' : 'accent'} size="sm">
                {scope === 'global' ? 'Global scope' : 'Per-thread scope'}
              </Badge>
            </div>
            <div className="text-sm text-[var(--agyn-text-subtle)] break-all">{selectedPathRef.current}</div>
            <div className="text-xs text-[var(--agyn-text-subtle)]">{documentStatus}</div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              icon={<RefreshCw className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              onClick={refetchPath}
              disabled={threadMissing}
              title="Refresh current path"
              aria-label="Refresh current path"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                if (readQuery.data) {
                  updateMutation.mutate({ oldContent: readQuery.data.content, newContent: editorValue });
                }
              }}
              disabled={saveDisabled}
            >
              <Save className="mr-2 h-4 w-4" />
              Save changes
            </Button>
          </div>
        </div>
        {renderThreadSelector()}
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        <ResizablePanel defaultSize={28} minSize={20} className="border-r border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
          <div className="flex h-full flex-col">
            <div className="border-b border-[var(--agyn-border-subtle)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--agyn-dark)]">Memory tree</h2>
              <p className="text-xs text-[var(--agyn-text-subtle)]">Browse memory locations</p>
            </div>
            {threadMissing ? (
              <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-[var(--agyn-text-subtle)]">
                Select a thread to browse per-thread memories.
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <MemoryTree
                  nodeId={nodeId}
                  scope={scope}
                  threadId={effectiveThreadId}
                  selectedPath={selectedPath}
                  onSelectPath={(path) => focusPath(path)}
                  className="bg-white"
                />
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={72} minSize={40} className="bg-white">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {threadMissing ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-[var(--agyn-text-subtle)]">
                  Choose a thread to edit per-thread memory content.
                </div>
              ) : (
                <div className="flex h-full flex-col gap-6">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-semibold text-[var(--agyn-dark)]">Document</h2>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (readQuery.data) {
                              setEditorValue(readQuery.data.content);
                              setEditorDirty(false);
                            }
                          }}
                          disabled={threadMissing || readBusy || readQuery.isError}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                    <MarkdownInput
                      value={editorValue}
                      onChange={handleEditorChange}
                      disabled={threadMissing || readBusy || readQuery.isError}
                      className="min-h-[360px]"
                      helperText={readQuery.error ? (readQuery.error as Error).message : undefined}
                    />
                  </section>

                  <section className="space-y-2 rounded-xl border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[var(--agyn-dark)]">Append content</h3>
                      <Button type="button" size="sm" variant="secondary" onClick={handleAppend} disabled={appendDisabled}>
                        <Plus className="mr-2 h-4 w-4" />
                        Append
                      </Button>
                    </div>
                    <Textarea
                      value={appendValue}
                      onChange={(event) => setAppendValue(event.target.value)}
                      placeholder="Content to append to the current document"
                      disabled={threadMissing || appendMutation.isPending}
                      className="min-h-[140px]"
                    />
                  </section>

                  <section className="grid gap-6 rounded-xl border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] p-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-[var(--agyn-dark)]">Create child location</h3>
                      <Input
                        value={newLocationName}
                        onChange={(event) => setNewLocationName(event.target.value)}
                        placeholder="Location name"
                        disabled={ensureDirMutation.isPending || threadMissing}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => handleCreateLocation(false)}
                          disabled={createLocationDisabled}
                        >
                          <FolderPlus className="mr-2 h-4 w-4" />
                          Create location
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleCreateLocation(true)}
                          disabled={createLocationDisabled}
                        >
                          <FolderPlus className="mr-2 h-4 w-4" />
                          Create & open
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-[var(--agyn-dark)]">Create child document</h3>
                      <Input
                        value={newDocumentName}
                        onChange={(event) => setNewDocumentName(event.target.value)}
                        placeholder="Document name"
                        disabled={appendMutation.isPending || threadMissing}
                      />
                      <Textarea
                        value={newDocumentContent}
                        onChange={(event) => setNewDocumentContent(event.target.value)}
                        placeholder="Initial content"
                        disabled={appendMutation.isPending || threadMissing}
                        className="min-h-[160px]"
                      />
                      <Button type="button" size="sm" variant="secondary" onClick={handleCreateDocument} disabled={createDocumentDisabled}>
                        <FilePlus2 className="mr-2 h-4 w-4" />
                        Create document
                      </Button>
                    </div>
                  </section>

                  <section className="rounded-xl border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--agyn-dark)]">Delete subtree</h3>
                        <p className="text-xs text-[var(--agyn-text-subtle)]">
                          Remove the selected document and all nested entries. This action cannot be undone.
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={deleteDisabled}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete “{selectedPathRef.current}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the document and its subdocuments. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-[var(--agyn-status-failed)] text-white hover:bg-[var(--agyn-status-failed)]/90"
                              onClick={handleDelete}
                              disabled={deleteMutation.isPending}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    {selectedPathRef.current === '/' ? (
                      <div className="mt-2 text-xs text-[var(--agyn-text-subtle)]">
                        The root path cannot be deleted.
                      </div>
                    ) : null}
                  </section>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
