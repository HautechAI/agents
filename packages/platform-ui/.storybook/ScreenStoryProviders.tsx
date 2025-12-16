import { useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { TemplatesProvider as RuntimeTemplatesProvider } from '../src/lib/graph/templates.provider';
import { UserProvider } from '../src/user/UserProvider';

export type ScreenParameters = {
  routePath?: string;
  initialEntry?: string;
};

export function ScreenStoryProviders({
  children,
  routePath,
  initialEntry,
}: {
  children: ReactNode;
  routePath: string;
  initialEntry: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RuntimeTemplatesProvider>
            <UserProvider>
              <Routes>
                <Route path={routePath} element={children} />
              </Routes>
            </UserProvider>
          </RuntimeTemplatesProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
