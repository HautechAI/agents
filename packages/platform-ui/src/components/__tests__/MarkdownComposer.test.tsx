import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react';
import React, { useState } from 'react';
import { MarkdownComposer, type MarkdownComposerProps } from '../MarkdownComposer';
import { MarkdownContent } from '../MarkdownContent';

interface ComposerHarnessProps {
  initialValue?: string;
  sendDisabled?: boolean;
  isSending?: boolean;
  onSend?: (value: string) => void;
  disabled?: boolean;
  renderPreview?: boolean;
}

function ComposerHarness({
  initialValue = '',
  sendDisabled,
  isSending,
  onSend,
  disabled,
  renderPreview = false,
}: ComposerHarnessProps) {
  const [value, setValue] = useState(initialValue);

  const composerProps: MarkdownComposerProps = {
    value,
    onChange: setValue,
    placeholder: 'Type a message...',
    sendDisabled,
    isSending,
    disabled,
  };

  if (onSend) {
    composerProps.onSend = () => {
      onSend(value);
    };
  }

  return (
    <>
      <MarkdownComposer {...composerProps} />
      <div data-testid="value-output">{value}</div>
      {renderPreview ? (
        <div data-testid="markdown-preview">
          <MarkdownContent content={value} />
        </div>
      ) : null}
    </>
  );
}

const getComposerEditor = () =>
  screen.getByTestId('markdown-composer-editor') as HTMLElement;

const getValue = () => screen.getByTestId('value-output').textContent ?? '';

const getSourceEditor = () =>
  screen.getByTestId('markdown-composer-source-editor') as HTMLTextAreaElement;

const switchToSourceView = () => {
  fireEvent.click(screen.getByTestId('markdown-composer-view-source'));
};

const switchToRenderedView = () => {
  fireEvent.click(screen.getByTestId('markdown-composer-view-rendered'));
};

const focusAndSelectAll = (editor: HTMLElement) => {
  editor.focus();
  fireEvent.focus(editor);
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
};

beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    }),
  });
});

describe('MarkdownComposer formatting', () => {
  it('wraps selected text in bold via toolbar', async () => {
    render(<ComposerHarness initialValue="hello" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('hello'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bold'));

    await waitFor(() => expect(getValue()).toBe('**hello**'));
  });

  it('toggles bulleted list for selected lines', async () => {
    render(<ComposerHarness initialValue={'Line one\n\nLine two'} />);

    const editor = getComposerEditor();
    await waitFor(() => expect(getValue()).toBe('Line one\n\nLine two'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bullet'));
    await waitFor(() => expect(getValue()).toBe('- Line one\n- Line two'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bullet'));
    await waitFor(() => expect(getValue()).toBe('Line one\n\nLine two'));
  });

  it('wraps code block with shortcut Cmd/Ctrl+Shift+E', async () => {
    render(<ComposerHarness initialValue="snippet" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('snippet'));

    focusAndSelectAll(editor);
    fireEvent.keyDown(editor, {
      key: 'E',
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(getValue()).toBe('```\nsnippet\n```'));
  });

  it('wraps inline code with shortcut Cmd/Ctrl+E', async () => {
    render(<ComposerHarness initialValue="inline" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('inline'));

    focusAndSelectAll(editor);
    fireEvent.keyDown(editor, {
      key: 'e',
      ctrlKey: true,
    });

    await waitFor(() => expect(getValue()).toBe('`inline`'));
  });

  it('wraps selected text in underline via toolbar', async () => {
    render(<ComposerHarness initialValue="focus" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('focus'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-underline'));

    await waitFor(() => expect(getValue()).toBe('<u>focus</u>'));
  });
});

describe('MarkdownComposer view modes', () => {
  it('maintains content when toggling between rendered and source modes', async () => {
    render(<ComposerHarness initialValue="hello world" />);

    await waitFor(() => expect(getValue()).toBe('hello world'));

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    expect(sourceEditor.value).toBe('hello world');

    fireEvent.change(sourceEditor, { target: { value: 'updated markdown' } });

    await waitFor(() => expect(getValue()).toBe('updated markdown'));

    switchToRenderedView();

    await waitFor(() => {
      const editor = getComposerEditor();
      expect(editor.textContent).toContain('updated markdown');
    });
  });

  it('applies bold formatting via toolbar in source view', async () => {
    render(<ComposerHarness initialValue="format me" />);

    await waitFor(() => expect(getValue()).toBe('format me'));

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();
    sourceEditor.setSelectionRange(0, sourceEditor.value.length);

    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bold'));

    await waitFor(() => expect(getValue()).toBe('**format me**'));
  });

  it('applies inline code via shortcut Cmd/Ctrl+E in source view', async () => {
    render(<ComposerHarness initialValue="inline" />);

    await waitFor(() => expect(getValue()).toBe('inline'));

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();
    sourceEditor.setSelectionRange(0, sourceEditor.value.length);

    fireEvent.keyDown(sourceEditor, {
      key: 'e',
      ctrlKey: true,
    });

    await waitFor(() => expect(getValue()).toBe('`inline`'));
  });

  it('calls onSend for Cmd/Ctrl+Enter in source view when enabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();

    fireEvent.keyDown(sourceEditor, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).toHaveBeenCalledWith('message');
  });
});

describe('MarkdownComposer sending', () => {
  it('calls onSend for Cmd/Ctrl+Enter when enabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    const editor = getComposerEditor();
    editor.focus();

    fireEvent.keyDown(editor, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).toHaveBeenCalledWith('message');
  });

  it('does not call onSend when disabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} sendDisabled />);

    const editor = getComposerEditor();
    editor.focus();

    fireEvent.keyDown(editor, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).not.toHaveBeenCalled();
  });
});

describe('MarkdownComposer markdown parity', () => {
  it('preserves underline markup when importing markdown', async () => {
    render(<ComposerHarness initialValue={'A <u>highlight</u>'} />);

    await waitFor(() => expect(getValue()).toBe('A <u>highlight</u>'));
  });

  it('renders MarkdownContent output matching serialized markdown', async () => {
    render(
      <ComposerHarness
        initialValue={'**bold** and <u>link</u> [Link](https://example.com)'}
        renderPreview
      />,
    );

    await waitFor(() => expect(getValue()).toBe('**bold** and <u>link</u> [Link](https://example.com)'));

    const preview = screen.getByTestId('markdown-preview');
    const link = within(preview).getByRole('link', { name: 'Link' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(preview.querySelector('strong')).not.toBeNull();
    expect(preview.querySelector('u')).not.toBeNull();
  });
});
