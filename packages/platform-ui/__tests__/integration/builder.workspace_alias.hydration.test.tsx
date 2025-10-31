import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from './testUtils';
import { useBuilderState } from '../../src/builder/hooks/useBuilderState';

function Harness({ expose }: { expose: (api: ReturnType<typeof useBuilderState>) => void }) {
  const api = useBuilderState('http://localhost:3010', { debounceMs: 100 });
  useEffect(() => {
    expose(api);
  }, [api, expose]);
  return <div data-testid="status">{api.loading ? 'loading' : 'ready'}</div>;
}

describe('Builder hydration: legacy containerProvider -> workspace alias', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('maps node.type and data.template to workspace on hydration', async () => {
    server.use(
      http.get('http://localhost:3010/api/graph/templates', () =>
        HttpResponse.json([
          { name: 'workspace', title: 'Workspace', kind: 'service', sourcePorts: [], targetPorts: [] },
          { name: 'shellTool', title: 'Shell', kind: 'tool', sourcePorts: [], targetPorts: [] },
        ]),
      ),
      http.get('http://localhost:3010/api/graph', () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          nodes: [
            { id: 'n1', template: 'containerProvider', config: {} },
          ],
          edges: [],
        }),
      ),
    );

    let api: ReturnType<typeof useBuilderState> | null = null;
    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );

    await waitFor(() => expect(api?.loading).toBe(false));
    const node = api!.nodes.find((n) => n.id === 'n1')!;
    expect(node.type).toBe('workspace');
    expect(node.data.template).toBe('workspace');
  });
});

