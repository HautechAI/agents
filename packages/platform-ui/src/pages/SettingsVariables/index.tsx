import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { useLogic } from './logic';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

export function SettingsVariables() {
  const {
    paginatedVariables,
    filteredCount,
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    searchTerm,
    isLoading,
    isError,
    errorMessage,
    isCreating,
    createForm,
    editingKey,
    editForm,
    isCreatePending,
    isUpdatePending,
    deletingKey,
    canSaveCreate,
    canSaveEdit,
    actions: {
      setSearchTerm,
      startCreate,
      cancelCreate,
      setCreateField,
      saveCreate,
      startEdit,
      cancelEdit,
      setEditField,
      saveEdit,
      deleteVariable,
      goToPage,
    },
  } = useLogic();

  const disableAddButton = isCreating || editingKey !== null || isCreatePending || isUpdatePending;
  const showEmptyState = !isLoading && !isError && filteredCount === 0 && !isCreating;
  const emptyMessage =
    searchTerm.trim().length > 0
      ? 'No variables match your search.'
      : 'No variables found. Click "Add Variable" to create one.';
  const showPagination = totalPages > 1 && filteredCount > 0;

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="flex h-full flex-col bg-white">
        <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Variables</h1>
              <p className="mt-1 text-sm text-[var(--agyn-text-subtle)]">Manage graph and local variables</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="sm:w-64">
                <Input
                  size="sm"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search variables"
                  leftIcon={<Search className="h-4 w-4" />}
                  aria-label="Search variables"
                />
              </div>
              <Button size="sm" onClick={startCreate} disabled={disableAddButton} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Variable
              </Button>
            </div>
          </div>
        </div>

        {isError && (
          <div role="alert" className="px-6 py-3 text-sm text-[var(--agyn-status-failed)]">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
                  <th className="bg-white px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--agyn-text-subtle)]">
                    Key
                  </th>
                  <th className="bg-white px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--agyn-text-subtle)]">
                    Graph Value
                  </th>
                  <th className="bg-white px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--agyn-text-subtle)]">
                    Local Value
                  </th>
                  <th className="bg-white px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--agyn-text-subtle)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isCreating && (
                  <tr className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-blue)]/5">
                    <td className="px-6 py-3 align-middle">
                      <Input
                        size="sm"
                        value={createForm.key}
                        onChange={(event) => setCreateField('key', event.target.value)}
                        placeholder="Enter key"
                        autoFocus
                      />
                    </td>
                    <td className="px-6 py-3 align-middle">
                      <Input
                        size="sm"
                        value={createForm.graph}
                        onChange={(event) => setCreateField('graph', event.target.value)}
                        placeholder="Enter graph value"
                      />
                    </td>
                    <td className="px-6 py-3 align-middle">
                      <Input
                        size="sm"
                        value={createForm.local}
                        onChange={(event) => setCreateField('local', event.target.value)}
                        placeholder="Enter local override"
                      />
                    </td>
                    <td className="px-6 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <IconButton
                              size="sm"
                              icon={<Check className="h-4 w-4" />}
                              aria-label="Save new variable"
                              onClick={saveCreate}
                              disabled={!canSaveCreate}
                              className="text-[var(--agyn-status-success)] hover:bg-[var(--agyn-status-success)]/10"
                            />
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              sideOffset={5}
                              className="rounded-md bg-[var(--agyn-dark)] px-2 py-1 text-xs text-white"
                            >
                              Save
                              <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <IconButton
                              size="sm"
                              icon={<X className="h-4 w-4" />}
                              aria-label="Cancel new variable"
                              onClick={cancelCreate}
                              disabled={isCreatePending}
                              className="text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]"
                            />
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              sideOffset={5}
                              className="rounded-md bg-[var(--agyn-dark)] px-2 py-1 text-xs text-white"
                            >
                              Cancel
                              <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </div>
                    </td>
                  </tr>
                )}

                {isLoading && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                      Loading variables…
                    </td>
                  </tr>
                )}

                {showEmptyState && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                      {emptyMessage}
                    </td>
                  </tr>
                )}

                {paginatedVariables.map((variable) => {
                  const isEditingRow = editingKey === variable.key;

                  if (isEditingRow) {
                    return (
                      <tr
                        key={variable.key}
                        className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-blue)]/5"
                      >
                        <td className="px-6 py-3 align-middle">
                          <div className="font-mono text-sm text-[var(--agyn-text-subtle)]">{variable.key}</div>
                        </td>
                        <td className="px-6 py-3 align-middle">
                          <Input
                            size="sm"
                            value={editForm.graph}
                            onChange={(event) => setEditField('graph', event.target.value)}
                          />
                        </td>
                        <td className="px-6 py-3 align-middle">
                          <Input
                            size="sm"
                            value={editForm.local}
                            onChange={(event) => setEditField('local', event.target.value)}
                          />
                        </td>
                        <td className="px-6 py-3 align-middle">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <IconButton
                                  size="sm"
                                  icon={<Check className="h-4 w-4" />}
                                  aria-label={`Save ${variable.key}`}
                                  onClick={saveEdit}
                                  disabled={!canSaveEdit}
                                  className="text-[var(--agyn-status-success)] hover:bg-[var(--agyn-status-success)]/10"
                                />
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  sideOffset={5}
                                  className="rounded-md bg-[var(--agyn-dark)] px-2 py-1 text-xs text-white"
                                >
                                  Save
                                  <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <IconButton
                                  size="sm"
                                  icon={<X className="h-4 w-4" />}
                                  aria-label={`Cancel editing ${variable.key}`}
                                  onClick={cancelEdit}
                                  disabled={isUpdatePending}
                                  className="text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]"
                                />
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  sideOffset={5}
                                  className="rounded-md bg-[var(--agyn-dark)] px-2 py-1 text-xs text-white"
                                >
                                  Cancel
                                  <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const isDeletePending = deletingKey === variable.key;
                  const disableRowActions =
                    isCreating || editingKey !== null || isCreatePending || isUpdatePending || isDeletePending;

                  return (
                    <tr
                      key={variable.key}
                      className="border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/50"
                    >
                      <td className="px-6 py-3 align-middle">
                        <span className="font-mono text-sm font-medium text-[var(--agyn-dark)]">{variable.key}</span>
                      </td>
                      <td className="px-6 py-3 align-middle">
                        <span className="text-sm text-[var(--agyn-dark)]">{variable.graph ?? '—'}</span>
                      </td>
                      <td className="px-6 py-3 align-middle">
                        <span className="text-sm text-[var(--agyn-dark)]">{variable.local ?? '—'}</span>
                      </td>
                      <td className="px-6 py-3 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <IconButton
                                size="sm"
                                icon={<Pencil className="h-4 w-4" />}
                                aria-label={`Edit ${variable.key}`}
                                onClick={() => startEdit(variable.key)}
                                disabled={disableRowActions}
                                className="text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)]"
                              />
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                sideOffset={5}
                                className="rounded-md bg-[var(--agyn-dark)] px-2 py-1 text-xs text-white"
                              >
                                Edit
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <IconButton
                                size="sm"
                                icon={<Trash2 className="h-4 w-4" />}
                                aria-label={`Delete ${variable.key}`}
                                onClick={() => deleteVariable(variable.key)}
                                disabled={disableRowActions}
                                className="text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)]"
                              />
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                sideOffset={5}
                                className="rounded-md bg-[var(--agyn-dark)] px-2 py-1 text-xs text-white"
                              >
                                Delete
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showPagination && (
            <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-[var(--agyn-text-subtle)]">
                  Showing {pageStart} to {pageEnd} of {filteredCount} variable{filteredCount === 1 ? '' : 's'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="rounded-md px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] transition-colors hover:text-[var(--agyn-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, index) => {
                      const pageNumber = index + 1;
                      const isActive = pageNumber === currentPage;
                      return (
                        <button
                          key={pageNumber}
                          type="button"
                          onClick={() => goToPage(pageNumber)}
                          className={`h-8 w-8 rounded-md text-sm transition-colors ${
                            isActive
                              ? 'bg-[var(--agyn-blue)]/10 font-medium text-[var(--agyn-blue)]'
                              : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="rounded-md px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] transition-colors hover:text-[var(--agyn-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
}
