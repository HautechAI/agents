import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RightPropertiesPanel } from '../RightPropertiesPanel';

vi.mock('@/lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: { provisionStatus: { state: 'ready' }, isPaused: false } }),
  useNodeAction: () => ({ mutate: () => {} }),
}));

vi.mock('@/lib/graph/templates.provider', async () => {
  return {
    useTemplatesCache: () => ({
      getTemplate: (name: string) => ({ name, kind: name === 'slackTrigger' ? 'trigger' : 'tool', title: name }),
    }),
  };
});

vi.mock('@/components/graph', () => ({ StaticConfigForm: () => <div>Static</div>, DynamicConfigForm: () => <div>Dynamic</div> }));
vi.mock('@/components/stream/TriggerEventsPanel', () => ({ TriggerEventsPanel: () => <div>Trigger Events</div> }));


describe('RightPropertiesPanel trigger integration', () => {
  it('renders TriggerEventsPanel for trigger nodes', () => {
    const node: any = { id: 'n1', data: { template: 'slackTrigger', config: {}, dynamicConfig: {} } };
    render(<RightPropertiesPanel node={node} onChange={() => {}} />);
    expect(screen.getByText('Trigger Events')).toBeInTheDocument();
  });

  it('does not render TriggerEventsPanel for non-trigger nodes', () => {
    const node: any = { id: 'n2', data: { template: 'sendSlackMessageTool', config: {}, dynamicConfig: {} } };
    render(<RightPropertiesPanel node={node} onChange={() => {}} />);
    expect(screen.queryByText('Trigger Events')).not.toBeInTheDocument();
  });
});
