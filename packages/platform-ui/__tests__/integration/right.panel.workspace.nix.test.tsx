import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TestProviders, server } from './testUtils';
import { RightPropertiesPanel } from '../../src/builder/panels/RightPropertiesPanel';
import type { Node as RFNode } from 'reactflow';

type TestNodeData = { template: string; name?: string; config?: Record<string, unknown>; state?: Record<string, unknown> };
function makeNode(template: string, id = 'n1'): RFNode<TestNodeData> {
  return {
    id,
    type: template,
    position: { x: 0, y: 0 },
    data: { template, name: template, config: {}, state: {} },
    dragHandle: '.drag-handle',
    selected: true,
  };
}

describe('RightPropertiesPanel Nix section for workspace alias', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders NixPackagesSection for template=workspace', async () => {
    render(
      <TestProviders>
        <RightPropertiesPanel node={makeNode('workspace')} onChange={() => {}} />
      </TestProviders>,
    );
    // Header or search input should be present
    expect(await screen.findByText('Nix Packages (beta)')).toBeInTheDocument();
    expect(screen.getByLabelText('Search Nix packages')).toBeInTheDocument();
  });
});

