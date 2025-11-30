import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ManageToolConfigView from '../ManageToolConfigView';

describe('ManageToolConfigView', () => {
  it('emits default configuration on mount', async () => {
    const handleChange = vi.fn();
    render(
      <ManageToolConfigView
        templateName="manageTool"
        value={{}}
        onChange={handleChange}
        readOnly={false}
        disabled={false}
      />,
    );

    await waitFor(() => expect(handleChange).toHaveBeenCalled());
    const last = handleChange.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    expect(last).toBeTruthy();
    expect(last?.mode).toBe('sync');
    expect(last?.syncTimeoutMs).toBe(15000);
    expect(last?.syncMaxMessages).toBe(1);
    expect(last?.asyncPrefix).toBe('From {{agentTitle}}: ');
    expect(last?.showCorrelationInOutput).toBe(false);
  });

  it('updates config when fields change', async () => {
    const handleChange = vi.fn();
    render(
      <ManageToolConfigView
        templateName="manageTool"
        value={{}}
        onChange={handleChange}
        readOnly={false}
        disabled={false}
      />,
    );

    const prefixInput = await screen.findByLabelText(/Async prefix/i);
    fireEvent.change(prefixInput, { target: { value: 'Custom prefix: ' } });
    await waitFor(() => {
      const last = handleChange.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      expect(last?.asyncPrefix).toBe('Custom prefix: ');
    });

    const maxMessagesInput = await screen.findByLabelText(/Max messages/i);
    fireEvent.change(maxMessagesInput, { target: { value: '3' } });
    await waitFor(() => {
      const last = handleChange.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      expect(last?.syncMaxMessages).toBe(3);
    });

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    await waitFor(() => {
      const last = handleChange.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      expect(last?.showCorrelationInOutput).toBe(true);
    });

    const modeTrigger = await screen.findByLabelText(/Forwarding mode/i);
    fireEvent.mouseDown(modeTrigger);
    const asyncOption = await screen.findByText(/Async/i);
    fireEvent.click(asyncOption);
    await waitFor(() => {
      const last = handleChange.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      expect(last?.mode).toBe('async');
    });
  });
});
