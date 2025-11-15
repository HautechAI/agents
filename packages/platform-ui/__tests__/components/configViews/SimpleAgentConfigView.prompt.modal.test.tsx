import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SimpleAgentConfigView from '@/components/configViews/SimpleAgentConfigView';

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value?: string; onChange?: (next: string) => void }) => (
    <textarea
      data-testid="mock-monaco"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

describe('SimpleAgentConfigView prompt modal', () => {
  it('opens modal, saves changes, and updates prompt value', async () => {
    const handleChange = vi.fn();
    render(
      <SimpleAgentConfigView
        templateName="agent"
        value={{ systemPrompt: 'hello world', model: 'gpt' }}
        onChange={handleChange}
        readOnly={false}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByTestId('prompt-expand-button'));

    expect(screen.getByTestId('prompt-modal')).toBeInTheDocument();

    const editor = await screen.findByTestId('mock-monaco');
    fireEvent.change(editor, { target: { value: 'updated prompt content' } });

    fireEvent.click(screen.getByTestId('prompt-modal-save'));

    await waitFor(() => expect(screen.queryByTestId('prompt-modal')).not.toBeInTheDocument());
    const textarea = screen.getByTestId('simple-agent-system') as HTMLTextAreaElement;
    expect(textarea.value).toBe('updated prompt content');

    expect(handleChange).toHaveBeenCalled();
    const lastCall = handleChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.systemPrompt).toBe('updated prompt content');
  });

  it('prompts for confirmation on cancel with unsaved changes and discards when confirmed', async () => {
    const handleChange = vi.fn();
    render(
      <SimpleAgentConfigView
        templateName="agent"
        value={{ systemPrompt: 'original prompt', model: 'gpt' }}
        onChange={handleChange}
        readOnly={false}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByTestId('prompt-expand-button'));
    const editor = await screen.findByTestId('mock-monaco');
    fireEvent.change(editor, { target: { value: 'dirty draft' } });

    fireEvent.click(screen.getByTestId('prompt-modal-cancel'));

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Discard'));

    await waitFor(() => expect(screen.queryByTestId('prompt-modal')).not.toBeInTheDocument());
    const textarea = screen.getByTestId('simple-agent-system') as HTMLTextAreaElement;
    expect(textarea.value).toBe('original prompt');

    const systemPrompts = handleChange.mock.calls.map((call) => call[0]?.systemPrompt);
    expect(systemPrompts).not.toContain('dirty draft');
  });
});
