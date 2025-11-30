import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AxiosError, isAxiosError } from 'axios';

import type { FlakeRepoSelection } from './types';
import { resolveRepo } from '@/api/modules/nix';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const REPO_ERROR_MESSAGES: Record<string, string> = {
  invalid_repository: 'Repository must be a GitHub owner/repo URL or shorthand.',
  repository_not_allowed: 'Repository is not allowed by server policy.',
  repo_not_found: 'Repository not found on GitHub.',
  ref_not_found: 'Branch, tag, or commit could not be resolved.',
  non_flake_repo: 'flake.nix not found in the repository at that ref.',
  unauthorized_private_repo: 'Configure a GitHub token to access this repository.',
  validation_error: 'Invalid repository, ref, or attribute.',
  github_error: 'GitHub API error while resolving repository.',
  timeout: 'Request timed out contacting GitHub.',
  server_error: 'Server error while resolving repository.',
};

const REQUIRED_FIELDS_ERROR = 'Repository and attribute are required.';

function describeRepoError(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    const code = typeof data?.error === 'string' ? data.error : undefined;
    if (code && REPO_ERROR_MESSAGES[code]) return REPO_ERROR_MESSAGES[code];
    if (data?.message && typeof data.message === 'string') return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message || 'Failed to resolve repository.';
  return 'Failed to resolve repository.';
}

function isCancellationError(err: unknown): boolean {
  if (isAxiosError(err)) {
    if (err.code === AxiosError.ERR_CANCELED || err.code === 'ERR_CANCELED') return true;
    if (err.name === 'CanceledError') return true;
  }
  return err instanceof DOMException && err.name === 'AbortError';
}

interface NixRepoInstallSectionProps {
  onAdd: (entry: FlakeRepoSelection) => void;
}

const INITIAL_FORM_STATE = { repository: '', ref: '', attr: '' } as const;

export function NixRepoInstallSection({ onAdd }: NixRepoInstallSectionProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resolveRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      resolveRef.current?.abort();
    };
  }, []);

  const updateField = useCallback((field: 'repository' | 'ref' | 'attr', value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  }, [error]);

  const resetForm = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current.abort();
      resolveRef.current = null;
    }
    setForm(INITIAL_FORM_STATE);
    setError(null);
    setSubmitting(false);
  }, []);

  const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    setOpen(nextOpen);
  }, [resetForm]);

  const handleSubmit = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    if (submitting) return;

    const repository = form.repository.trim();
    const attr = form.attr.trim();
    const ref = form.ref.trim();

    if (!repository || !attr) {
      setError(REQUIRED_FIELDS_ERROR);
      return;
    }

    resolveRef.current?.abort();
    const controller = new AbortController();
    resolveRef.current = controller;
    setSubmitting(true);
    setError(null);

    try {
      const result = await resolveRepo(repository, attr, ref || undefined, controller.signal);
      const nextEntry: FlakeRepoSelection = {
        kind: 'flakeRepo',
        repository: result.repository,
        commitHash: result.commitHash,
        attributePath: result.attributePath,
        ...(result.ref ? { ref: result.ref } : {}),
      };
      onAdd(nextEntry);
      handleDialogOpenChange(false);
    } catch (err) {
      if (!isCancellationError(err)) {
        setError(describeRepoError(err));
      }
    } finally {
      setSubmitting(false);
      if (resolveRef.current === controller) {
        resolveRef.current = null;
      }
    }
  }, [form.attr, form.repository, form.ref, handleDialogOpenChange, onAdd, submitting]);

  const isRequiredError = error === REQUIRED_FIELDS_ERROR;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Add custom</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom Nix package</DialogTitle>
          <DialogDescription>
            Resolve a Git repository and add its package attribute to this configuration.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="nix-repo-repository" className="text-sm font-medium text-[var(--agyn-dark)]">
              Repository<span className="text-[var(--agyn-status-failed)]">*</span>
            </Label>
            <Input
              id="nix-repo-repository"
              value={form.repository}
              onChange={(event) => updateField('repository', event.target.value)}
              placeholder="owner/repo or github:owner/repo"
              aria-label="GitHub repository"
              aria-invalid={isRequiredError && !form.repository.trim() ? true : undefined}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nix-repo-ref" className="text-sm font-medium text-[var(--agyn-dark)]">Branch/Ref (optional)</Label>
            <Input
              id="nix-repo-ref"
              value={form.ref}
              onChange={(event) => updateField('ref', event.target.value)}
              placeholder="main"
              aria-label="Git ref"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nix-repo-attr" className="text-sm font-medium text-[var(--agyn-dark)]">
              Package Attribute<span className="text-[var(--agyn-status-failed)]">*</span>
            </Label>
            <Input
              id="nix-repo-attr"
              value={form.attr}
              onChange={(event) => updateField('attr', event.target.value)}
              placeholder="packages.x86_64-linux.default"
              aria-label="Flake attribute"
              aria-invalid={isRequiredError && !form.attr.trim() ? true : undefined}
              autoComplete="off"
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--agyn-status-failed)]" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => handleDialogOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type { NixRepoInstallSectionProps };
