import React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { QueryClient } from '@tanstack/react-query';
import { TestProviders, server, abs } from './integration/testUtils';
import { SettingsVariables } from '../src/pages/SettingsVariables';

describe('SettingsVariables page', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('shows loading then empty state', async () => {
    server.use(
      http.get('/api/graph/variables', async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/graph/variables'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return HttpResponse.json({ items: [] });
      })
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/variables' }]}>
        <TestProviders>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    expect(screen.getByText('Loading variables…')).toBeInTheDocument();
    expect(await screen.findByText(/No variables found/)).toBeInTheDocument();
  });

  it('creates a variable with graph and local values', async () => {
    const items: Array<{ key: string; graph: string | null; local: string | null }> = [
      { key: 'alpha', graph: 'a-graph', local: null },
    ];

    const getHandler = () => HttpResponse.json({ items });
    server.use(
      http.get('/api/graph/variables', getHandler),
      http.get(abs('/api/graph/variables'), getHandler),
      http.post('/api/graph/variables', async ({ request }) => {
        const body = (await request.json()) as { key: string; graph: string };
        items.push({ key: body.key, graph: body.graph, local: null });
        return new HttpResponse(JSON.stringify(body), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
      http.post(abs('/api/graph/variables'), async ({ request }) => {
        const body = (await request.json()) as { key: string; graph: string };
        if (!items.find((item) => item.key === body.key)) {
          items.push({ key: body.key, graph: body.graph, local: null });
        }
        return new HttpResponse(JSON.stringify(body), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
      http.put('/api/graph/variables/:key', async ({ params, request }) => {
        const key = params.key as string;
        const body = (await request.json()) as { graph?: string; local?: string | null };
        const target = items.find((item) => item.key === key);
        if (target) {
          if (typeof body.graph === 'string') target.graph = body.graph;
          if (Object.prototype.hasOwnProperty.call(body, 'local')) {
            target.local = body.local ?? null;
          }
        }
        return HttpResponse.json({ key, ...body });
      }),
      http.put(abs('/api/graph/variables/:key'), async ({ params, request }) => {
        const key = params.key as string;
        const body = (await request.json()) as { graph?: string; local?: string | null };
        const target = items.find((item) => item.key === key);
        if (target) {
          if (typeof body.graph === 'string') target.graph = body.graph;
          if (Object.prototype.hasOwnProperty.call(body, 'local')) {
            target.local = body.local ?? null;
          }
        }
        return HttpResponse.json({ key, ...body });
      })
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/variables' }]}>
        <TestProviders>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    await screen.findByText('alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Add Variable' }));
    fireEvent.change(screen.getByPlaceholderText('Enter key'), { target: { value: 'beta' } });
    fireEvent.change(screen.getByPlaceholderText('Enter graph value'), { target: { value: 'b-graph' } });
    fireEvent.change(screen.getByPlaceholderText('Enter local override'), { target: { value: 'local-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new variable' }));

    const betaRow = await screen.findByText('beta');
    const row = within(betaRow.closest('tr') as HTMLTableRowElement);
    expect(row.getByText('b-graph')).toBeInTheDocument();
    expect(row.getByText('local-b')).toBeInTheDocument();
  });

  it('edits an existing variable', async () => {
    const items: Array<{ key: string; graph: string | null; local: string | null }> = [
      { key: 'gamma', graph: 'g-graph', local: 'override' },
    ];

    const getHandler = () => HttpResponse.json({ items });
    server.use(
      http.get('/api/graph/variables', getHandler),
      http.get(abs('/api/graph/variables'), getHandler),
      http.put('/api/graph/variables/:key', async ({ params, request }) => {
        const key = params.key as string;
        const body = (await request.json()) as { graph?: string; local?: string | null };
        const target = items.find((item) => item.key === key);
        if (target) {
          if (typeof body.graph === 'string') target.graph = body.graph;
          if (Object.prototype.hasOwnProperty.call(body, 'local')) target.local = body.local ?? null;
        }
        return HttpResponse.json({ key, ...body });
      }),
      http.put(abs('/api/graph/variables/:key'), async ({ params, request }) => {
        const key = params.key as string;
        const body = (await request.json()) as { graph?: string; local?: string | null };
        const target = items.find((item) => item.key === key);
        if (target) {
          if (typeof body.graph === 'string') target.graph = body.graph;
          if (Object.prototype.hasOwnProperty.call(body, 'local')) target.local = body.local ?? null;
        }
        return HttpResponse.json({ key, ...body });
      })
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/variables' }]}>
        <TestProviders>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    await screen.findByText('gamma');
    fireEvent.click(screen.getByRole('button', { name: 'Edit gamma' }));
    const graphInput = screen.getAllByDisplayValue('g-graph')[0] as HTMLInputElement;
    fireEvent.change(graphInput, { target: { value: 'g-graph-2' } });
    fireEvent.change(screen.getAllByDisplayValue('override')[0], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save gamma' }));

    await screen.findByText('g-graph-2');
    const row = within(screen.getByText('gamma').closest('tr') as HTMLTableRowElement);
    expect(row.getByText('—')).toBeInTheDocument();
  });

  it('deletes a variable after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const items: Array<{ key: string; graph: string | null; local: string | null }> = [
      { key: 'delta', graph: 'value', local: null },
    ];

    const getHandler = () => HttpResponse.json({ items });
    server.use(
      http.get('/api/graph/variables', getHandler),
      http.get(abs('/api/graph/variables'), getHandler),
      http.delete('/api/graph/variables/:key', async ({ params }) => {
        const key = params.key as string;
        const index = items.findIndex((item) => item.key === key);
        if (index >= 0) items.splice(index, 1);
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(abs('/api/graph/variables/:key'), async ({ params }) => {
        const key = params.key as string;
        const index = items.findIndex((item) => item.key === key);
        if (index >= 0) items.splice(index, 1);
        return new HttpResponse(null, { status: 204 });
      })
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/variables' }]}>
        <TestProviders>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    await screen.findByText('delta');
    fireEvent.click(screen.getByRole('button', { name: 'Delete delta' }));

    expect(confirmSpy).toHaveBeenCalled();
    await screen.findByText(/No variables found/);
  });

  it('filters by search keyword', async () => {
    const items = Array.from({ length: 3 }, (_, index) => ({
      key: index === 0 ? 'apple' : index === 1 ? 'banana' : 'carrot',
      graph: `g-${index}`,
      local: null,
    }));

    const getHandler = () => HttpResponse.json({ items });
    server.use(http.get('/api/graph/variables', getHandler), http.get(abs('/api/graph/variables'), getHandler));

    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/variables' }]}>
        <TestProviders>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    await screen.findByText('apple');
    const searchInput = screen.getByLabelText('Search variables');
    fireEvent.change(searchInput, { target: { value: 'ban' } });

    expect(await screen.findByText('banana')).toBeInTheDocument();
    expect(screen.queryByText('apple')).not.toBeInTheDocument();
    expect(screen.queryByText('carrot')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'zuc' } });
    expect(await screen.findByText(/No variables match/)).toBeInTheDocument();
  });

  it('paginates results client-side', async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      key: `key-${index + 1}`,
      graph: `graph-${index + 1}`,
      local: null,
    }));

    const getHandler = () => HttpResponse.json({ items });
    server.use(http.get('/api/graph/variables', getHandler), http.get(abs('/api/graph/variables'), getHandler));

    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/variables' }]}>
        <TestProviders>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    const table = await screen.findByRole('table');
    await screen.findByText('key-1');
    const body = table.querySelector('tbody');
    expect(body).not.toBeNull();
    await waitFor(() => {
      expect(within(body as HTMLTableSectionElement).getAllByRole('row')).toHaveLength(20);
    });
    expect(screen.getByText('key-1')).toBeInTheDocument();
    expect(screen.queryByText('key-25')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('key-25');
    expect(screen.getByText('key-21')).toBeInTheDocument();
  });

  it('preserves in-progress edits when the data refetches', async () => {
    const items: Array<{ key: string; graph: string | null; local: string | null }> = [
      { key: 'alpha', graph: 'server-graph', local: 'server-local' },
    ];

    const getHandler = () =>
      HttpResponse.json({
        items: items.map((item) => ({ ...item })),
      });

    server.use(
      http.get('/api/graph/variables', getHandler),
      http.get(abs('/api/graph/variables'), getHandler),
    );

    const queryClient = new QueryClient();

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/settings/variables' }]}
      >
        <TestProviders queryClient={queryClient}>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    await screen.findByText('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Edit alpha' }));

    const graphInput = screen.getByDisplayValue('server-graph') as HTMLInputElement;
    const localInput = screen.getByDisplayValue('server-local') as HTMLInputElement;

    fireEvent.change(graphInput, { target: { value: 'user-graph' } });
    fireEvent.change(localInput, { target: { value: 'user-local' } });

    expect(graphInput).toHaveValue('user-graph');
    expect(localInput).toHaveValue('user-local');

    items[0] = { key: 'alpha', graph: 'server-graph-updated', local: 'server-local-updated' };

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['variables'] });
    });

    expect(graphInput).toHaveValue('user-graph');
    expect(localInput).toHaveValue('user-local');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing alpha' }));

    await screen.findByRole('button', { name: 'Edit alpha' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit alpha' }));

    expect(await screen.findByDisplayValue('server-graph-updated')).toBeInstanceOf(HTMLInputElement);
    expect(await screen.findByDisplayValue('server-local-updated')).toBeInstanceOf(HTMLInputElement);
  });

  it('reports server errors with friendly messages', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const items = [{ key: 'dup', graph: 'value', local: null }];

    const getHandler = () => HttpResponse.json({ items });
    server.use(
      http.get('/api/graph/variables', getHandler),
      http.get(abs('/api/graph/variables'), getHandler),
      http.post('/api/graph/variables', () => new HttpResponse(JSON.stringify({ error: 'DUPLICATE_KEY' }), { status: 409 })),
      http.post(abs('/api/graph/variables'), () => new HttpResponse(JSON.stringify({ error: 'DUPLICATE_KEY' }), { status: 409 }))
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/variables' }]}>
        <TestProviders>
          <SettingsVariables />
        </TestProviders>
      </MemoryRouter>
    );

    await screen.findByText('dup');
    fireEvent.click(screen.getByRole('button', { name: 'Add Variable' }));
    fireEvent.change(screen.getByPlaceholderText('Enter key'), { target: { value: 'dup' } });
    fireEvent.change(screen.getByPlaceholderText('Enter graph value'), { target: { value: 'other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new variable' }));

    expect(alertSpy).toHaveBeenCalledWith('Key already exists');
  });
});
