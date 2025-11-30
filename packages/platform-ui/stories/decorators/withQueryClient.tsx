import { useState } from 'react';
import type { Decorator } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const withQueryClient: Decorator = (Story) => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <MemoryRouter initialEntries={['/threads/thread-001/runs/run-001']}>
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    </MemoryRouter>
  );
};
