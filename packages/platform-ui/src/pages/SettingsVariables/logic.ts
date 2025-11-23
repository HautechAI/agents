import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asData, http } from '@/api/http';
import { notifyError, notifySuccess } from '@/lib/notify';
import { isAxiosError } from 'axios';

export interface VariableItem {
  key: string;
  graph: string | null;
  local: string | null;
}

interface CreateForm {
  key: string;
  graph: string;
  local: string;
}

interface EditForm {
  graph: string;
  local: string;
}

interface UseLogicActions {
  setSearchTerm(value: string): void;
  startCreate(): void;
  cancelCreate(): void;
  setCreateField(field: keyof CreateForm, value: string): void;
  saveCreate(): void;
  startEdit(key: string): void;
  cancelEdit(): void;
  setEditField(field: keyof EditForm, value: string): void;
  saveEdit(): void;
  deleteVariable(key: string): void;
  goToPage(page: number): void;
}

interface UseLogicResult {
  paginatedVariables: VariableItem[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  searchTerm: string;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  isCreating: boolean;
  createForm: CreateForm;
  editingKey: string | null;
  editForm: EditForm;
  isCreatePending: boolean;
  isUpdatePending: boolean;
  deletingKey: string | null;
  canSaveCreate: boolean;
  canSaveEdit: boolean;
  actions: UseLogicActions;
}

const ITEMS_PER_PAGE = 20;

const INITIAL_CREATE_FORM: CreateForm = { key: '', graph: '', local: '' };
const INITIAL_EDIT_FORM: EditForm = { graph: '', local: '' };
const EMPTY_LIST: VariableItem[] = [];

const ERROR_MESSAGES: Record<string, string> = {
  DUPLICATE_KEY: 'Key already exists',
  BAD_VALUE: 'Value cannot be empty',
  BAD_KEY: 'Key is required',
  VERSION_CONFLICT: 'Version conflict, please retry',
  GRAPH_NOT_FOUND: 'Graph not found',
  KEY_NOT_FOUND: 'Variable not found',
};

async function fetchVariables(): Promise<VariableItem[]> {
  const data = await asData<{ items: VariableItem[] }>(http.get('/api/graph/variables'));
  return data.items ?? [];
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const mapCode = (code?: string | null) => {
    if (!code) return undefined;
    const normalized = code.trim();
    if (!normalized) return undefined;
    const upper = normalized.toUpperCase();
    return ERROR_MESSAGES[upper] ?? normalized;
  };

  if (isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    const coded = mapCode(data?.error);
    if (coded) return coded;
    const dataMessage = data?.message && typeof data.message === 'string' ? data.message.trim() : '';
    if (dataMessage) {
      const mapped = ERROR_MESSAGES[dataMessage.toUpperCase()] ?? dataMessage;
      return mapped;
    }
    const message = error.message?.trim();
    if (message) {
      const mapped = ERROR_MESSAGES[message.toUpperCase()] ?? message;
      return mapped;
    }
  }

  if (error instanceof Error && error.message) {
    const trimmed = error.message.trim();
    if (trimmed) {
      const mapped = ERROR_MESSAGES[trimmed.toUpperCase()] ?? trimmed;
      return mapped;
    }
  }

  if (typeof error === 'string' && error.trim()) {
    const normalized = error.trim();
    const mapped = ERROR_MESSAGES[normalized.toUpperCase()] ?? normalized;
    return mapped;
  }

  return fallback;
}

export function useLogic(): UseLogicResult {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(INITIAL_CREATE_FORM);
  const [editForm, setEditForm] = useState<EditForm>(INITIAL_EDIT_FORM);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const variablesQuery = useQuery({ queryKey: ['variables'], queryFn: fetchVariables });
  const variables = variablesQuery.data ?? EMPTY_LIST;

  const filteredVariables = useMemo(() => {
    if (!searchTerm.trim()) return variables;
    const query = searchTerm.trim().toLowerCase();
    return variables.filter((item) => item.key.toLowerCase().includes(query));
  }, [searchTerm, variables]);

  const filteredCount = filteredVariables.length;
  const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / ITEMS_PER_PAGE);

  useEffect(() => {
    if (filteredCount === 0) {
      setCurrentPage(1);
    } else if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredCount, totalPages, currentPage]);

  useEffect(() => {
    if (!editingKey) return;
    const original = variables.find((item) => item.key === editingKey);
    if (original) {
      setEditForm({ graph: original.graph ?? '', local: original.local ?? '' });
    }
  }, [editingKey, variables]);

  const paginatedVariables = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVariables.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredVariables, currentPage]);

  const pageStart = filteredCount === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const pageEnd = filteredCount === 0 ? 0 : Math.min(filteredCount, currentPage * ITEMS_PER_PAGE);

  const createMutation = useMutation({
    mutationFn: async ({ key, graph, local }: { key: string; graph: string; local?: string }) => {
      await asData(http.post('/api/graph/variables', { key, graph }));
      if (typeof local === 'string' && local.trim().length > 0) {
        await asData(http.put(`/api/graph/variables/${encodeURIComponent(key)}`, { local }));
      }
    },
    onSuccess: () => {
      notifySuccess('Variable added');
      setIsCreating(false);
      setCreateForm(INITIAL_CREATE_FORM);
      setCurrentPage(1);
      queryClient.invalidateQueries({ queryKey: ['variables'] });
    },
    onError: (error) => {
      notifyError(resolveErrorMessage(error, 'Failed to create variable'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ key, patch }: { key: string; patch: { graph?: string; local?: string | null } }) => {
      await asData(http.put(`/api/graph/variables/${encodeURIComponent(key)}`, patch));
    },
    onSuccess: () => {
      notifySuccess('Variable updated');
      setEditingKey(null);
      setEditForm(INITIAL_EDIT_FORM);
      queryClient.invalidateQueries({ queryKey: ['variables'] });
    },
    onError: (error) => {
      notifyError(resolveErrorMessage(error, 'Failed to update variable'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      await asData(http.delete(`/api/graph/variables/${encodeURIComponent(key)}`));
    },
    onMutate: (key: string) => {
      setDeletingKey(key);
    },
    onSuccess: () => {
      notifySuccess('Variable deleted');
      queryClient.invalidateQueries({ queryKey: ['variables'] });
    },
    onError: (error) => {
      notifyError(resolveErrorMessage(error, 'Failed to delete variable'));
    },
    onSettled: () => {
      setDeletingKey(null);
    },
  });

  const handleSetSearchTerm = useCallback(
    (value: string) => {
      setSearchTerm(value);
      setCurrentPage(1);
    },
    []
  );

  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setEditingKey(null);
    setCreateForm(INITIAL_CREATE_FORM);
  }, []);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
    setCreateForm(INITIAL_CREATE_FORM);
  }, []);

  const handleSetCreateField = useCallback((field: keyof CreateForm, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveCreate = useCallback(() => {
    if (createMutation.isPending) return;

    const key = createForm.key.trim();
    const graph = createForm.graph.trim();
    if (!key) {
      notifyError('Key is required');
      return;
    }
    if (!graph) {
      notifyError('Graph value is required');
      return;
    }
    if (variables.some((item) => item.key === key)) {
      notifyError('Key already exists');
      return;
    }

    const localValue = createForm.local;
    const local = localValue.trim().length > 0 ? localValue : undefined;
    createMutation.mutate({ key, graph, local });
  }, [createForm, createMutation, variables]);

  const handleStartEdit = useCallback(
    (key: string) => {
      const target = variables.find((item) => item.key === key);
      if (!target) {
        notifyError('Variable not found');
        return;
      }
      setIsCreating(false);
      setEditingKey(key);
      setEditForm({ graph: target.graph ?? '', local: target.local ?? '' });
    },
    [variables]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditForm(INITIAL_EDIT_FORM);
  }, []);

  const handleSetEditField = useCallback((field: keyof EditForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingKey || updateMutation.isPending) return;

    const original = variables.find((item) => item.key === editingKey);
    if (!original) {
      notifyError('Variable not found');
      setEditingKey(null);
      return;
    }

    const graphValue = editForm.graph.trim();
    if (!graphValue) {
      notifyError('Graph value is required');
      return;
    }

    const patch: { graph?: string; local?: string | null } = {};
    const originalGraph = original.graph ?? '';
    if (graphValue !== originalGraph) {
      patch.graph = graphValue;
    }

    const localRaw = editForm.local;
    if (!localRaw.trim()) {
      if (original.local !== null) {
        patch.local = null;
      }
    } else if (localRaw !== (original.local ?? '')) {
      patch.local = localRaw;
    }

    if (Object.keys(patch).length === 0) {
      setEditingKey(null);
      setEditForm(INITIAL_EDIT_FORM);
      return;
    }

    updateMutation.mutate({ key: editingKey, patch });
  }, [editForm, editingKey, updateMutation, variables]);

  const handleDeleteVariable = useCallback(
    (key: string) => {
      if (deleteMutation.isPending) return;
      const confirmed = window.confirm('Are you sure you want to delete this variable?');
      if (!confirmed) return;
      deleteMutation.mutate(key);
    },
    [deleteMutation]
  );

  const handleGoToPage = useCallback(
    (page: number) => {
      setCurrentPage(() => {
        const min = 1;
        const max = totalPages || 1;
        const next = Math.min(Math.max(page, min), max);
        return next;
      });
    },
    [totalPages]
  );

  const canSaveCreate = createForm.key.trim().length > 0 && createForm.graph.trim().length > 0 && !createMutation.isPending;
  const canSaveEdit = editingKey != null && editForm.graph.trim().length > 0 && !updateMutation.isPending;

  const errorMessage = variablesQuery.isError
    ? resolveErrorMessage(variablesQuery.error, 'Failed to load variables')
    : '';

  return {
    paginatedVariables,
    filteredCount,
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    searchTerm,
    isLoading: variablesQuery.isLoading,
    isError: variablesQuery.isError,
    errorMessage,
    isCreating,
    createForm,
    editingKey,
    editForm,
    isCreatePending: createMutation.isPending,
    isUpdatePending: updateMutation.isPending,
    deletingKey,
    canSaveCreate,
    canSaveEdit,
    actions: {
      setSearchTerm: handleSetSearchTerm,
      startCreate: handleStartCreate,
      cancelCreate: handleCancelCreate,
      setCreateField: handleSetCreateField,
      saveCreate: handleSaveCreate,
      startEdit: handleStartEdit,
      cancelEdit: handleCancelEdit,
      setEditField: handleSetEditField,
      saveEdit: handleSaveEdit,
      deleteVariable: handleDeleteVariable,
      goToPage: handleGoToPage,
    },
  };
}
