import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { TemplateSchema } from '@/api/types/graph';
import { useTemplates } from './hooks';

type TemplatesCacheValue = {
  templates: TemplateSchema[];
  ready: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  getTemplate: (name: string | null | undefined) => TemplateSchema | undefined;
};

const TemplatesCacheContext = createContext<TemplatesCacheValue | null>(null);

export function TemplatesProvider({ children }: { children: ReactNode }) {
  const { data, status, error, refetch } = useTemplates();

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const value = useMemo<TemplatesCacheValue>(() => {
    const templates = data ?? [];
    const getTemplate = (name: string | null | undefined) => {
      if (!name) return undefined;
      return templates.find((t) => t.name === name);
    };

    return {
      templates,
      ready: status === 'success',
      error,
      refresh,
      getTemplate,
    };
  }, [data, status, error, refresh]);

  return <TemplatesCacheContext.Provider value={value}>{children}</TemplatesCacheContext.Provider>;
}

export function useTemplatesCache(): TemplatesCacheValue {
  const ctx = useContext(TemplatesCacheContext);
  if (!ctx) {
    throw new Error('useTemplatesCache must be used within TemplatesProvider');
  }
  return ctx;
}
