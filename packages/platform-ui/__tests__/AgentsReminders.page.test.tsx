import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type * as ReactRouterDom from 'react-router-dom';

const navigateMock = vi.fn<(path: string) => void>();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TestProviders, server, abs } from './integration/testUtils';
import { AgentsReminders } from '../src/pages/AgentsReminders';

const API_PATH = '/api/agents/reminders';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/agents/reminders' }]}>
      <TestProviders>
        <AgentsReminders />
      </TestProviders>
    </MemoryRouter>,
  );
}

describe('AgentsReminders page', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    navigateMock.mockReset();
  });
  afterAll(() => server.close());

  it('renders reminders with server metadata', async () => {
    const payload = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'Soon', at: t(100), createdAt: t(50), completedAt: null, cancelledAt: null },
        { id: 'r2', threadId: 'th2', note: 'Done', at: t(200), createdAt: t(150), completedAt: t(210), cancelledAt: null },
        { id: 'r3', threadId: 'th3', note: 'Cancelled', at: t(300), createdAt: t(250), completedAt: null, cancelledAt: t(310) },
      ],
      page: 1,
      pageSize: 20,
      totalCount: 3,
      pageCount: 1,
      countsByStatus: { scheduled: 1, executed: 1, cancelled: 1 },
      sortApplied: { key: 'latest', order: 'desc' },
    } as const;

    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('filter')).toBe('all');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('pageSize')).toBe('20');
      expect(url.searchParams.get('sort')).toBe('latest');
      expect(url.searchParams.get('order')).toBe('desc');
      return HttpResponse.json(payload);
    };

    server.use(http.get(API_PATH, handler), http.get(abs(API_PATH), handler));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByText('Soon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All \(3\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scheduled \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Executed \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancelled \(1\)/i })).toBeInTheDocument();
  });

  it('requests backend filter values and resets page when switching filters', async () => {
    const requests: Array<{ filter: string | null; page: string | null }> = [];
    const allPayload = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'Soon', at: t(100), createdAt: t(50), completedAt: null, cancelledAt: null },
      ],
      page: 1,
      pageSize: 20,
      totalCount: 1,
      pageCount: 1,
      countsByStatus: { scheduled: 1, executed: 0, cancelled: 0 },
      sortApplied: { key: 'latest', order: 'desc' },
    } as const;
    const completedPayload = {
      items: [
        { id: 'r2', threadId: 'th2', note: 'Done', at: t(200), createdAt: t(150), completedAt: t(210), cancelledAt: null },
      ],
      page: 1,
      pageSize: 20,
      totalCount: 1,
      pageCount: 1,
      countsByStatus: { scheduled: 1, executed: 1, cancelled: 0 },
      sortApplied: { key: 'latest', order: 'desc' },
    } as const;

    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      requests.push({ filter: url.searchParams.get('filter'), page: url.searchParams.get('page') });
      const filter = url.searchParams.get('filter');
      if (filter === 'completed') {
        expect(url.searchParams.get('page')).toBe('1');
        return HttpResponse.json(completedPayload);
      }
      return HttpResponse.json(allPayload);
    };

    server.use(http.get(API_PATH, handler), http.get(abs(API_PATH), handler));

    renderPage();

    expect(await screen.findByText('Soon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Executed \(0\)/i }));

    expect(await screen.findByText('Done')).toBeInTheDocument();

    expect(requests.some(({ filter, page }) => filter === 'completed' && page === '1')).toBe(true);
  });

  it('requests the next page when pagination controls are used', async () => {
    const payloadPage1 = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'First', at: t(100), createdAt: t(50), completedAt: null, cancelledAt: null },
        { id: 'r2', threadId: 'th2', note: 'Second', at: t(200), createdAt: t(150), completedAt: null, cancelledAt: null },
      ],
      page: 1,
      pageSize: 2,
      totalCount: 4,
      pageCount: 2,
      countsByStatus: { scheduled: 4, executed: 0, cancelled: 0 },
      sortApplied: { key: 'latest', order: 'desc' },
    } as const;
    const payloadPage2 = {
      items: [
        { id: 'r3', threadId: 'th3', note: 'Third', at: t(300), createdAt: t(250), completedAt: null, cancelledAt: null },
        { id: 'r4', threadId: 'th4', note: 'Fourth', at: t(400), createdAt: t(350), completedAt: null, cancelledAt: null },
      ],
      page: 2,
      pageSize: 2,
      totalCount: 4,
      pageCount: 2,
      countsByStatus: { scheduled: 4, executed: 0, cancelled: 0 },
      sortApplied: { key: 'latest', order: 'desc' },
    } as const;

    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const pageParam = url.searchParams.get('page') ?? '1';
      return pageParam === '2' ? HttpResponse.json(payloadPage2) : HttpResponse.json(payloadPage1);
    };

    server.use(http.get(API_PATH, handler), http.get(abs(API_PATH), handler));

    renderPage();

    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 2 of 4 reminders/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Third')).toBeInTheDocument();
    expect(screen.getByText(/Showing 3 to 4 of 4 reminders/i)).toBeInTheDocument();
  });

  it('shows error overlay and retries successfully', async () => {
    let attempt = 0;
    const handler = () => {
      attempt += 1;
      if (attempt === 1) {
        return new HttpResponse(null, { status: 500 });
      }
      return HttpResponse.json({
        items: [
          { id: 'r1', threadId: 'th1', note: 'Recovered', at: t(100), createdAt: t(50), completedAt: null, cancelledAt: null },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        pageCount: 1,
        countsByStatus: { scheduled: 1, executed: 0, cancelled: 0 },
        sortApplied: { key: 'latest', order: 'desc' },
      });
    };

    server.use(http.get(API_PATH, handler), http.get(abs(API_PATH), handler));

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Request failed with status code 500');

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('navigates to thread when view action is clicked', async () => {
    navigateMock.mockClear();

    const payload = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'Soon', at: t(100), createdAt: t(50), completedAt: null, cancelledAt: null },
      ],
      page: 1,
      pageSize: 20,
      totalCount: 1,
      pageCount: 1,
      countsByStatus: { scheduled: 1, executed: 0, cancelled: 0 },
      sortApplied: { key: 'latest', order: 'desc' },
    } as const;

    const handler = () => HttpResponse.json(payload);
    server.use(http.get(API_PATH, handler), http.get(abs(API_PATH), handler));

    renderPage();

    const noteCell = await screen.findByText('Soon');
    const row = noteCell.closest('tr');
    expect(row).not.toBeNull();
    const actionButtons = within(row as HTMLTableRowElement).getAllByRole('button');
    fireEvent.click(actionButtons[0]);

    expect(navigateMock).toHaveBeenCalledWith('/agents/threads/th1');
  });
});
