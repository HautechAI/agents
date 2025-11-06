import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestProviders } from './integration/testUtils';
import { MonitoringContainers } from '../src/pages/MonitoringContainers';

describe('MonitoringContainers page', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders truncated containerId with tooltip and copy', async () => {
    const items = [{
      containerId: '1234567890abcdef',
      threadId: null,
      role: 'workspace',
      image: 'node:20',
      status: 'running' as const,
      startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      lastUsedAt: new Date('2024-01-01T01:00:00Z').toISOString(),
      killAfterAt: null,
    }];
    const httpJson = vi.fn(async () => ({ items }));
    vi.mock('@/api/client', async () => ({ httpJson }));
    // Clipboard stub
    const writeText = vi.fn();
    (globalThis as any).navigator = { clipboard: { writeText } };
    render(<MemoryRouter initialEntries={[{ pathname: '/monitoring/containers' }]}><TestProviders><MonitoringContainers /></TestProviders></MemoryRouter>);
    // truncated id should be visible
    expect(await screen.findByText('12345678')).toBeTruthy();
    // open tooltip by hovering (fireEvent.mouseOver on element)
    const short = screen.getByText('12345678');
    fireEvent.mouseOver(short);
    await waitFor(() => { expect(screen.getByText('1234567890abcdef')).toBeTruthy(); });
    // click copy button
    const copyBtn = screen.getByLabelText('Copy containerId');
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith('1234567890abcdef');
  });

  it('applies threadId filter only when valid UUID', async () => {
    const items = [] as any[];
    const httpJson = vi.fn(async () => ({ items }));
    vi.mock('@/api/client', async () => ({ httpJson }));
    render(<MemoryRouter initialEntries={[{ pathname: '/monitoring/containers' }]}><TestProviders><MonitoringContainers /></TestProviders></MemoryRouter>);
    const input = screen.getByLabelText('Filter by threadId');
    fireEvent.change(input, { target: { value: 'not-a-uuid' } });
    await waitFor(() => expect(httpJson).toHaveBeenCalled());
    // Should not include threadId param when invalid
    expect((httpJson.mock.calls[0]?.[0] as string)).not.toMatch(/threadId=/);
    // Now provide a valid UUID
    const uuid = '11111111-1111-1111-1111-111111111111';
    fireEvent.change(input, { target: { value: uuid } });
    await waitFor(() => expect(httpJson).toHaveBeenCalledTimes(2));
    const url = httpJson.mock.calls[1]?.[0] as string;
    expect(url).toMatch(/threadId=11111111-1111-1111-1111-111111111111/);
    // Clear/reset
    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);
    await waitFor(() => expect(httpJson).toHaveBeenCalledTimes(3));
    const url3 = httpJson.mock.calls[2]?.[0] as string;
    expect(url3).not.toMatch(/threadId=/);
  });

  it('expands row to fetch and render sidecars', async () => {
    const parentId = 'abc123456789';
    const items = [{
      containerId: parentId,
      threadId: '11111111-1111-1111-1111-111111111111',
      role: 'workspace',
      image: 'node:20',
      status: 'running' as const,
      startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      lastUsedAt: new Date('2024-01-01T01:00:00Z').toISOString(),
      killAfterAt: null,
    }];
    const sidecars = [{
      containerId: 'sc-999988887777',
      parentContainerId: parentId,
      role: 'dind' as const,
      image: 'docker:27-dind',
      status: 'running' as const,
      startedAt: new Date('2024-01-01T00:10:00Z').toISOString(),
    }];
    const httpJson = vi.fn(async (url: string) => {
      if (url.startsWith('/api/containers?')) return { items };
      if (url.endsWith(`/api/containers/${encodeURIComponent(parentId)}/sidecars`)) return { items: sidecars } as any;
      return { items: [] } as any;
    });
    vi.mock('@/api/client', async () => ({ httpJson }));
    render(<MemoryRouter initialEntries={[{ pathname: '/monitoring/containers' }]}><TestProviders><MonitoringContainers /></TestProviders></MemoryRouter>);
    // Expand the row
    const expandBtn = await screen.findByLabelText('Expand');
    fireEvent.click(expandBtn);
    // Sidecar truncated id should render under parent row
    await waitFor(() => expect(screen.getByText('sc-999988')).toBeTruthy());
    // Role column should show dind for sidecar
    expect(screen.getByText('dind')).toBeTruthy();
  });
});

