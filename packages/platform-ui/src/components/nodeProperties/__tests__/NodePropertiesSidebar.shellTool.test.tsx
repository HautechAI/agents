import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NodePropertiesSidebar, { type NodeConfig } from '@/components/NodePropertiesSidebar';

describe('nodeProperties/NodePropertiesSidebar shellTool config', () => {
  it('renders shell tool properties and propagates config updates', async () => {
    const onConfigChange = vi.fn();
    const user = userEvent.setup();

    function Harness() {
      const [config, setConfig] = React.useState<NodeConfig>({
        kind: 'Tool',
        title: 'Shell Command',
        template: 'shellTool',
      } as NodeConfig);

      const handleConfigChange = (updates: Partial<NodeConfig>) => {
        setConfig((prev) => ({ ...(prev as Record<string, unknown>), ...(updates as Record<string, unknown>) } as NodeConfig));
        onConfigChange(updates);
      };

      return <NodePropertiesSidebar config={config} state={{ status: 'ready' }} onConfigChange={handleConfigChange} />;
    }

    render(<Harness />);

    expect(screen.getByText('Log to PID 1')).toBeInTheDocument();
    expect(
      screen.getByText('Duplicate stdout/stderr to PID 1 (requires /bin/bash).'),
    ).toBeInTheDocument();

    const workdirInput = screen.getByPlaceholderText('/workspace');
    fireEvent.change(workdirInput, { target: { value: '/app' } });
    expect(onConfigChange.mock.calls.at(-1)?.[0]).toMatchObject({ workdir: '/app' });

    await user.click(screen.getByRole('button', { name: /add variable/i }));
    expect(onConfigChange.mock.calls.at(-1)?.[0]).toMatchObject({
      env: [
        {
          name: '',
          value: '',
        },
      ],
    });

    const envNameInput = await screen.findByPlaceholderText('VARIABLE_NAME');
    fireEvent.change(envNameInput, { target: { value: 'API_KEY' } });
    expect(onConfigChange.mock.calls.at(-1)?.[0]).toMatchObject({
      env: [
        expect.objectContaining({ name: 'API_KEY' }),
      ],
    });

    const envValueInput = await screen.findByPlaceholderText('Value or reference...');
    fireEvent.change(envValueInput, { target: { value: 'secret/data#token' } });
    expect(onConfigChange.mock.calls.at(-1)?.[0]).toMatchObject({
      env: [
        expect.objectContaining({ value: 'secret/data#token' }),
      ],
    });

    await user.click(screen.getByRole('button', { name: /limits/i }));

    const limitCases: Array<{ placeholder: string; key: string; value: string; expected: number }> = [
      { placeholder: '3600000', key: 'executionTimeoutMs', value: '120000', expected: 120000 },
      { placeholder: '60000', key: 'idleTimeoutMs', value: '30000', expected: 30000 },
      { placeholder: '50000', key: 'outputLimitChars', value: '5000', expected: 5000 },
      { placeholder: '40', key: 'chunkCoalesceMs', value: '25', expected: 25 },
      { placeholder: '4096', key: 'chunkSizeBytes', value: '2048', expected: 2048 },
      { placeholder: '10485760', key: 'clientBufferLimitBytes', value: '65536', expected: 65536 },
    ];

    for (const testCase of limitCases) {
      const input = await screen.findByPlaceholderText(testCase.placeholder);
      fireEvent.change(input, { target: { value: testCase.value } });
      expect(onConfigChange.mock.calls.at(-1)?.[0]).toMatchObject({
        [testCase.key]: testCase.expected,
      });
    }

    const logToggle = screen.getByRole('switch', { name: /log to pid 1/i });
    await user.click(logToggle);
    expect(onConfigChange.mock.calls.at(-1)?.[0]).toMatchObject({ logToPid1: false });
  });
});
