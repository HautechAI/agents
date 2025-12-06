import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import WorkspaceConfigView from '@/components/configViews/WorkspaceConfigView';

vi.mock('@/features/secrets/utils/flatVault', () => ({
  listAllSecretPaths: () => Promise.resolve(['kv/workspace/db', 'kv/workspace/api']),
}));

vi.mock('@/features/variables/api', () => ({
  listVariables: () => Promise.resolve([{ key: 'GLOBAL_TOKEN' }, { key: 'SOME_VAR' }]),
}));

const pointerProto = Element.prototype as unknown as {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

if (!pointerProto.hasPointerCapture) {
  pointerProto.hasPointerCapture = () => false;
}
if (!pointerProto.setPointerCapture) {
  pointerProto.setPointerCapture = () => {};
}
if (!pointerProto.releasePointerCapture) {
  pointerProto.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('WorkspaceConfigView payload', () => {
  it('emits aligned schema shape', () => {
    let cfg: any = {};
    render(
      <TooltipProvider delayDuration={0}>
        <WorkspaceConfigView
          templateName="workspace"
          value={{}}
          onChange={(v) => (cfg = v)}
          readOnly={false}
          disabled={false}
        />
      </TooltipProvider>,
    );
    // Query the exact label as in UI
    const img = screen.getByLabelText('Image') as HTMLInputElement;
    fireEvent.change(img, { target: { value: 'node:20' } });
    fireEvent.click(screen.getByText('Add env'));
    fireEvent.change(screen.getByTestId('env-name-0'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('env-value-0'), { target: { value: '1' } });
    const cpuLimit = screen.getByLabelText('CPU limit') as HTMLInputElement;
    fireEvent.change(cpuLimit, { target: { value: '750m' } });
    const memoryLimit = screen.getByLabelText('Memory limit') as HTMLInputElement;
    fireEvent.change(memoryLimit, { target: { value: '512Mi' } });
    fireEvent.click(screen.getByLabelText('Enable Docker-in-Docker sidecar'));
    fireEvent.click(screen.getByLabelText('Enable persistent workspace volume'));
    const mountPath = screen.getByLabelText('Mount path') as HTMLInputElement;
    fireEvent.change(mountPath, { target: { value: '/data' } });
    const ttl = screen.getByLabelText('Workspace TTL (seconds)') as HTMLInputElement;
    fireEvent.change(ttl, { target: { value: '123' } });

    expect(cfg.image).toBe('node:20');
    expect(Array.isArray(cfg.env)).toBe(true);
    expect(cfg.env[0]).toEqual({ name: 'A', value: '1' });
    expect(cfg.env[0]).not.toHaveProperty('source');
    expect(cfg.cpu_limit).toBe('750m');
    expect(cfg.memory_limit).toBe('512Mi');
    expect(cfg.enableDinD).toBe(true);
    expect(cfg.ttlSeconds).toBe(123);
    expect(cfg.volumes).toEqual({ enabled: true, mountPath: '/data' });
  });

  it('supports selecting variable suggestions for env entries', async () => {
    const user = userEvent.setup();
    let cfg: any = {};
    render(
      <TooltipProvider delayDuration={0}>
        <WorkspaceConfigView
          templateName="workspace"
          value={{}}
          onChange={(v) => (cfg = v)}
          readOnly={false}
          disabled={false}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByText('Add env'));
    fireEvent.change(screen.getByTestId('env-name-0'), { target: { value: 'APP_TOKEN' } });

    const envField = screen.getByTestId('env-value-0').parentElement?.parentElement;
    if (!envField) throw new Error('Env field container not found');
    const sourceTrigger = within(envField).getByRole('combobox');
    await user.click(sourceTrigger);
    const variableOption = await screen.findByRole('option', { name: /variable/i });
    await user.click(variableOption);

    const valueInput = screen.getByTestId('env-value-0');
    await user.click(valueInput);
    const suggestion = await screen.findByText('GLOBAL_TOKEN');
    await user.click(suggestion);

    expect(cfg.env?.[0]).toMatchObject({
      name: 'APP_TOKEN',
      source: 'variable',
    });
    expect(cfg.env?.[0]?.value).toEqual({ kind: 'var', name: 'GLOBAL_TOKEN' });
  });
});
