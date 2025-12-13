import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodeState } from '../types';
import { TooltipProvider } from '@/components/ui/tooltip';

const latestReferenceProps: { current: any } = { current: null };

vi.mock('../../ReferenceInput', () => ({
  ReferenceInput: (props: any) => {
    latestReferenceProps.current = props;
    return (
      <input
        data-testid="reference-input"
        value={props.value}
        onChange={(event) => props.onChange?.({ target: { value: event.target.value } })}
        onFocus={() => props.onFocus?.()}
      />
    );
  },
}));

describe('NodePropertiesSidebar - shell tool', () => {
  beforeEach(() => {
    latestReferenceProps.current = null;
  });

  it('renders shell tool controls and propagates config updates', () => {
    const onConfigChange = vi.fn();

    const config: NodeConfig = {
      kind: 'Tool',
      title: 'Shell Tool',
      template: 'shellTool',
      workdir: '/workspace',
      env: [{ id: 'env-1', name: 'TOKEN', value: 'initial', source: 'static' }],
      executionTimeoutMs: 1000,
      idleTimeoutMs: 2000,
      outputLimitChars: 3000,
      chunkCoalesceMs: 40,
      chunkSizeBytes: 4096,
      clientBufferLimitBytes: 1024,
      logToPid1: true,
    } satisfies NodeConfig;
    const state: NodeState = { status: 'ready' };

    render(
      <TooltipProvider delayDuration={0}>
        <NodePropertiesSidebar
          nodeId="node-1"
          config={config}
          state={state}
          onConfigChange={onConfigChange}
          onProvision={vi.fn()}
          onDeprovision={vi.fn()}
          canProvision={false}
          canDeprovision={true}
          isActionPending={false}
        />
      </TooltipProvider>,
    );

    const workdirInput = screen.getByLabelText('Working directory') as HTMLInputElement;
    fireEvent.change(workdirInput, { target: { value: '/tmp' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ workdir: '/tmp' }));

    const envInput = screen.getByTestId('reference-input') as HTMLInputElement;
    fireEvent.change(envInput, { target: { value: 'updated' } });

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.arrayContaining([
          expect.objectContaining({ name: 'TOKEN', value: 'updated' }),
        ]),
      }),
    );

    const executionTimeoutInput = screen.getByLabelText('Execution timeout (ms)') as HTMLInputElement;
    fireEvent.change(executionTimeoutInput, { target: { value: '2500' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ executionTimeoutMs: 2500 }));

    const idleTimeoutInput = screen.getByLabelText('Idle timeout (ms)') as HTMLInputElement;
    fireEvent.change(idleTimeoutInput, { target: { value: '4000' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ idleTimeoutMs: 4000 }));

    const outputLimitInput = screen.getByLabelText('Output limit (characters)') as HTMLInputElement;
    fireEvent.change(outputLimitInput, { target: { value: '8192' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ outputLimitChars: 8192 }));

    const chunkCoalesceInput = screen.getByLabelText('Chunk coalesce (ms)') as HTMLInputElement;
    fireEvent.change(chunkCoalesceInput, { target: { value: '55' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ chunkCoalesceMs: 55 }));

    const chunkSizeInput = screen.getByLabelText('Chunk size (bytes)') as HTMLInputElement;
    fireEvent.change(chunkSizeInput, { target: { value: '8192' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ chunkSizeBytes: 8192 }));

    const clientBufferInput = screen.getByLabelText('Client buffer limit (bytes)') as HTMLInputElement;
    fireEvent.change(clientBufferInput, { target: { value: '2048' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ clientBufferLimitBytes: 2048 }));

    const logToggle = screen.getByLabelText('Log to PID 1') as HTMLInputElement;
    fireEvent.click(logToggle);
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ logToPid1: false }));
  });
});
