import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders } from './integration/testUtils';
import { MemoryRouter } from 'react-router-dom';

describe('AgentsThreads layout', () => {
  it('renders header, threads list, and conversation panels', async () => {
    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    expect(await screen.findByTestId('threads-list')).toBeInTheDocument();
    expect(screen.getByText('Select a thread to view details')).toBeInTheDocument();
    const filterButtons = screen.getAllByRole('button', { name: /^(Open|Resolved|All)$/ });
    expect(filterButtons.map((button) => button.textContent)).toEqual(['Open', 'Resolved', 'All']);
    expect(screen.getByTitle('New thread')).toBeInTheDocument();
  });
});
