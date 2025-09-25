import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DynamicConfigForm from '../DynamicConfigForm';

let ready = false;
let schemaData: any = undefined;
let pending = false;
let setMutateImpl: any = vi.fn();

vi.mock('../../../lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: { dynamicConfigReady: ready } }),
  useDynamicConfig: () => ({
    schema: { data: schemaData },
    set: { mutate: (...args: any[]) => setMutateImpl(...args), isPending: pending },
  }),
}));

describe('DynamicConfigForm', () => {
  beforeEach(() => {
    ready = false;
    schemaData = undefined;
    pending = false;
    setMutateImpl = vi.fn();
  });

  const renderForm = () => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <DynamicConfigForm nodeId="n1" templateName="tmpl" />
      </QueryClientProvider>,
    );
  };

  it('shows placeholder when not ready', () => {
    renderForm();
    expect(screen.getByText(/Dynamic config not available yet/)).toBeInTheDocument();
  });

  it('renders form when ready and submits', () => {
    ready = true;
    schemaData = { type: 'object', properties: { a: { type: 'boolean', title: 'a' } } };
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <DynamicConfigForm nodeId="n1" templateName="tmpl" />
      </QueryClientProvider>,
    );
    const input = screen.getByLabelText('a') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    fireEvent.click(screen.getByText('Save'));
    expect(setMutateImpl).toHaveBeenCalled();
  });

  it('disables Save while pending', () => {
    ready = true;
    schemaData = { type: 'object', properties: { a: { type: 'boolean', title: 'a' } } };
    pending = true;
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <DynamicConfigForm nodeId="n1" templateName="tmpl" />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Save')).toBeDisabled();
  });
});
