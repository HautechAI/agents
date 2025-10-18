import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { server, TestProviders } from './testUtils';
import { AgentBuilder } from '@/builder/AgentBuilder';
import { http, HttpResponse } from 'msw';

describe('Nix packages persistence in builder graph', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('stores selected packages under Workspace config.nix.packages and posts immutably', async () => {
    // Setup one containerProvider node as initial graph
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json([
          { name: 'containerProvider', title: 'Workspace', kind: 'service', sourcePorts: [], targetPorts: [], capabilities: { staticConfigurable: true } },
        ]),
      ),
      http.get('/api/graph', () =>
        HttpResponse.json({ name: 'g', version: 1, nodes: [{ id: 'ws', template: 'containerProvider', config: { image: 'alpine:3' } }], edges: [] }),
      ),
    );

    let posted: any = null;
    server.use(
      http.post('/api/graph', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ version: (posted?.version ?? 0) + 1 });
      }),
    );

    render(
      <TestProviders>
        <AgentBuilder />
      </TestProviders>,
    );

    // Select the containerProvider node in the canvas sidebar by simulating selection via DOM is complex.
    // Instead, locate the Nix search input presence after initial render. It appears when the right panel loads.
    // Trigger a search and select a result.
    const input = await screen.findByLabelText('Search Nix packages');
    fireEvent.change(input, { target: { value: 'htop' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /htop \(htop\.attr\)/ }));

    // Choose channel
    const select = await screen.findByLabelText('Select version for htop (htop.attr)');
    fireEvent.change(select, { target: { value: 'nixpkgs-unstable' } });

    // Wait for autosave debounce (default 1000ms) + buffer
    await new Promise((r) => setTimeout(r, 1200));

    // Verify graph payload contains nix.packages under config of the containerProvider node
    expect(posted).toBeTruthy();
    const node = posted.nodes.find((n: any) => n.id === 'ws');
    expect(node.config.image).toBe('alpine:3');
    expect(node.config.nix.packages.length).toBe(1);
    expect(node.config.nix.packages[0]).toEqual({ attr: 'htop.attr', pname: 'htop', channel: 'nixpkgs-unstable' });
  });
});

