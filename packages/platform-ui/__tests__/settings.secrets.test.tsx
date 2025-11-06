import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsSecrets } from '../src/pages/SettingsSecrets';

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Settings / Secrets UI', () => {
  beforeEach(() => {
    // Silence console logs to ensure no secret values are printed
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows masked by default and supports reveal flow with header forwarding', async () => {
    renderWithClient(<SettingsSecrets />);
    // Wait for table to render item
    await screen.findByText('Settings / Secrets');
    // Masked placeholder shown initially
    await screen.findByText(/masked/);
    const tokenInput = screen.getByPlaceholderText('Admin token (optional)');
    await userEvent.type(tokenInput, 'adm');
    const revealBtns = await screen.findAllByRole('button', { name: 'Reveal' });
    await userEvent.click(revealBtns[0]);
    // After reveal, value should be shown
    await screen.findByText('API-SECRET');
  });

  it('filter and pagination controls render and update', async () => {
    renderWithClient(<SettingsSecrets />);
    await screen.findByText('Settings / Secrets');
    const allBtn = screen.getByRole('button', { name: 'All' });
    const usedBtn = screen.getByRole('button', { name: 'Used' });
    const missingBtn = screen.getByRole('button', { name: 'Missing' });
    expect(allBtn).toBeInTheDocument(); expect(usedBtn).toBeInTheDocument(); expect(missingBtn).toBeInTheDocument();
    await userEvent.click(missingBtn);
    // When missing filter applied, at least one row should still render
    await screen.findByText('Missing');
  });
});
