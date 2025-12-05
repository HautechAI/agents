import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Bold,
  Code,
  CodeSquare,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Quote,
  Send,
  Underline,
} from 'lucide-react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  createCommand,
} from 'lexical';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/markdown';
import {
  registerCodeHighlighting,
  PrismTokenizer,
  $isCodeNode,
  $createCodeNode,
  CodeHighlightNode,
  CodeNode,
  getCodeLanguageOptions,
} from '@lexical/code';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { HeadingNode, QuoteNode, $createQuoteNode } from '@lexical/rich-text';
import { LinkNode } from '@lexical/link';
import type { HTMLAttributes } from 'react';
import { IconButton } from './IconButton';
import { Dropdown } from './Dropdown';
import { FullscreenMarkdownEditor } from './FullscreenMarkdownEditor';
import {
  MARKDOWN_COMPOSER_TRANSFORMERS,
  decodeUnderlinePlaceholders,
  encodeUnderlinePlaceholders,
} from '@/lib/markdown/transformers';
import { MARKDOWN_COMPOSER_THEME } from '@/lib/markdown/composerTheme';

import type { AutosizeTextareaProps } from './AutosizeTextarea';

type Formatter = () => void;

export interface MarkdownComposerRTEProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minLines?: number;
  maxLines?: number;
  sendDisabled?: boolean;
  isSending?: boolean;
  onSend?: () => void;
  className?: string;
  textareaAriaLabel?: string;
  textareaProps?: Omit<AutosizeTextareaProps, 'value' | 'onChange' | 'ref' | 'minLines' | 'maxLines' | 'disabled' | 'placeholder'>;
}

const isModKey = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;

const TOGGLE_BLOCKQUOTE_COMMAND = createCommand<void>('TOGGLE_BLOCKQUOTE_COMMAND');
const TOGGLE_CODE_BLOCK_COMMAND = createCommand<void>('TOGGLE_CODE_BLOCK_COMMAND');
const AUTO_CODE_LANGUAGE = 'auto';
const AUTO_LANGUAGE_VALUES = new Set(['plain', 'plaintext', 'text']);

interface ToolbarAction {
  id: string;
  icon: ReactNode;
  label: string;
  formatter: Formatter;
}

function MarkdownPlaceholder({ placeholder }: { placeholder: string }) {
  return (
    <div className="pointer-events-none absolute left-3 top-2 text-sm text-[var(--agyn-gray)]">
      {placeholder}
    </div>
  );
}

function MarkdownComposerEditable({
  placeholder,
  minHeight,
  maxHeight,
  ariaLabel,
  ariaDescribedBy,
  ariaLabelledBy,
  id,
  disabled,
}: {
  placeholder: string;
  minHeight: number;
  maxHeight?: number;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaLabelledBy?: string;
  id?: string;
  disabled: boolean;
}) {
  const style: HTMLAttributes<HTMLDivElement>['style'] = {
    minHeight,
    overflowY: typeof maxHeight === 'number' ? 'auto' : 'hidden',
  };

  if (typeof maxHeight === 'number') {
    style.maxHeight = maxHeight;
  }

  return (
    <div className="relative">
      <RichTextPlugin
        contentEditable={(
          <ContentEditable
            id={id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-multiline="true"
            aria-disabled={disabled || undefined}
            aria-placeholder={placeholder}
            role="textbox"
            spellCheck
            className="min-h-full w-full resize-none whitespace-pre-wrap break-words rounded-[10px] border border-transparent bg-transparent px-3 py-2 pr-12 text-sm leading-relaxed text-[var(--agyn-dark)] focus:outline-none focus-visible:outline-none"
            data-testid="markdown-composer-editor"
            style={style}
          />
        )}
        placeholder={<MarkdownPlaceholder placeholder={placeholder} />}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </div>
  );
}

function MarkdownComposerEditableStatePlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);

  return null;
}

function MarkdownComposerCodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  const tokenizer = useMemo(() => ({
    ...PrismTokenizer,
    defaultLanguage: 'plain',
  }), []);

  useEffect(() => {
    return registerCodeHighlighting(editor, tokenizer);
  }, [editor, tokenizer]);

  return null;
}

function MarkdownComposerMarkdownPlugin({
  markdown,
  onMarkdownChange,
  maxLength,
}: {
  markdown: string;
  onMarkdownChange: (value: string) => void;
  maxLength?: number;
}) {
  const [editor] = useLexicalComposerContext();
  const isImportingRef = useRef(false);
  const lastValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastValueRef.current === markdown) {
      return;
    }

    editor.update(() => {
      isImportingRef.current = true;
      const root = $getRoot();
      root.clear();
      if (markdown) {
        $convertFromMarkdownString(
          encodeUnderlinePlaceholders(markdown),
          MARKDOWN_COMPOSER_TRANSFORMERS,
        );
      }
      root.selectEnd();
      lastValueRef.current = markdown;
      isImportingRef.current = false;
    });
  }, [editor, markdown]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      if (isImportingRef.current) {
        return;
      }

      let serialized = '';

      editorState.read(() => {
        serialized = $convertToMarkdownString(MARKDOWN_COMPOSER_TRANSFORMERS);
      });

      serialized = decodeUnderlinePlaceholders(serialized);
      if (serialized === lastValueRef.current) {
        return;
      }

      if (typeof maxLength === 'number' && serialized.length > maxLength) {
        editor.update(() => {
          isImportingRef.current = true;
          const root = $getRoot();
          root.clear();
          if (lastValueRef.current) {
            $convertFromMarkdownString(
              encodeUnderlinePlaceholders(lastValueRef.current),
              MARKDOWN_COMPOSER_TRANSFORMERS,
            );
          }
          root.selectEnd();
          isImportingRef.current = false;
        });
        return;
      }

      lastValueRef.current = serialized;
      onMarkdownChange(serialized);
    });

    return unregister;
  }, [editor, maxLength, onMarkdownChange]);

  return null;
}

function MarkdownComposerFormatPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = mergeRegister(
      editor.registerCommand(
        TOGGLE_BLOCKQUOTE_COMMAND,
        () => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }

            const processed = new Set<string>();

            selection.getNodes().forEach((node) => {
              const candidate = node.getTopLevelElementOrThrow();
              if (!$isElementNode(candidate)) {
                return;
              }
              const topLevel = candidate;
              const key = topLevel.getKey();

              if (processed.has(key)) {
                return;
              }

              processed.add(key);

              const type = topLevel.getType();
              if (type === 'quote') {
                const paragraph = $createParagraphNode();
                const children = [...topLevel.getChildren()];
                children.forEach((child) => paragraph.append(child));
                topLevel.replace(paragraph);
                return;
              }

              if (type === 'paragraph' || type.startsWith('heading')) {
                const quoteNode = $createQuoteNode();
                const children = [...topLevel.getChildren()];
                children.forEach((child) => quoteNode.append(child));
                topLevel.replace(quoteNode);
              }
            });
          });

          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
      editor.registerCommand(
        TOGGLE_CODE_BLOCK_COMMAND,
        () => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }

            const processed = new Set<string>();

            selection.getNodes().forEach((node) => {
              const candidate = node.getTopLevelElementOrThrow();
              if (!$isElementNode(candidate)) {
                return;
              }
              const topLevel = candidate;
              const key = topLevel.getKey();

              if (processed.has(key)) {
                return;
              }

              processed.add(key);

              const type = topLevel.getType();
              if ($isCodeNode(topLevel)) {
                const paragraph = $createParagraphNode();
                const children = [...topLevel.getChildren()];
                children.forEach((child) => paragraph.append(child));
                topLevel.replace(paragraph);
                return;
              }

              if (type === 'paragraph' || type.startsWith('heading')) {
                const codeNode = $createCodeNode().setLanguage('plain');
                const children = [...topLevel.getChildren()];
                if (children.length === 0) {
                  codeNode.append($createTextNode(''));
                } else {
                  children.forEach((child) => codeNode.append(child));
                }
                topLevel.replace(codeNode);
              }
            });
          });

          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    );

    return unregister;
  }, [editor]);

  return null;
}

function MarkdownComposerKeymapPlugin({
  disabled,
  onSend,
  sendDisabled,
}: {
  disabled: boolean;
  onSend?: () => void;
  sendDisabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (disabled) {
          return false;
        }

        if (event.key === 'Enter' && isModKey(event)) {
          if (onSend && !sendDisabled) {
            event.preventDefault();
            onSend();
            return true;
          }
          return false;
        }

        if (!isModKey(event) || event.altKey) {
          return false;
        }

        const key = event.key.toLowerCase();

        if (!event.shiftKey) {
          if (key === 'b') {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            return true;
          }

          if (key === 'i') {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
            return true;
          }

          if (key === 'u') {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
            return true;
          }

          if (key === 'e') {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
            return true;
          }
        }

        if (event.shiftKey) {
          if (key === 'e') {
            event.preventDefault();
            editor.dispatchCommand(TOGGLE_CODE_BLOCK_COMMAND, undefined);
            return true;
          }

          if (key === '8') {
            event.preventDefault();
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            return true;
          }

          if (key === '7') {
            event.preventDefault();
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            return true;
          }

          if (key === '9') {
            event.preventDefault();
            editor.dispatchCommand(TOGGLE_BLOCKQUOTE_COMMAND, undefined);
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [disabled, editor, onSend, sendDisabled]);

  return null;
}

interface ToolbarState {
  blockType: 'paragraph' | 'quote' | 'code';
  listType: 'bullet' | 'number' | 'none';
  codeLanguage: string;
}

function getSelectedElementState(editor: LexicalEditor): ToolbarState {
  let blockType: ToolbarState['blockType'] = 'paragraph';
  let listType: ToolbarState['listType'] = 'none';
  let codeLanguage = '';

  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    const anchorNode = selection.anchor.getNode();
    if (anchorNode.getType() === 'root') {
      return;
    }

    const element = anchorNode.getTopLevelElementOrThrow();
    if (!$isElementNode(element)) {
      return;
    }

    if ($isListNode(element)) {
      const list = element;
      const type = list.getListType();
      if (type === 'number') {
        listType = 'number';
      } else {
        listType = 'bullet';
      }
      blockType = 'paragraph';
      return;
    }

    if ($isCodeNode(element)) {
      blockType = 'code';
      listType = 'none';
      const language = element.getLanguage() ?? '';
      codeLanguage = !language || AUTO_LANGUAGE_VALUES.has(language) ? '' : language;
      return;
    }

    const elementType = element.getType();
    if (elementType === 'quote') {
      blockType = 'quote';
    } else {
      blockType = 'paragraph';
    }
    listType = 'none';
  });

  return { blockType, listType, codeLanguage };
}

function MarkdownComposerToolbar({
  disabled,
  onOpenFullscreen,
}: {
  disabled: boolean;
  onOpenFullscreen: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [toolbarState, setToolbarState] = useState<ToolbarState>(() => getSelectedElementState(editor));

  useEffect(() => {
    const updateToolbar = () => {
      setToolbarState(getSelectedElementState(editor));
    };

    updateToolbar();

    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    const unregisterUpdate = editor.registerUpdateListener(() => {
      updateToolbar();
    });

    return () => {
      unregisterSelection();
      unregisterUpdate();
    };
  }, [editor]);

  const applyBold = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
  }, [editor]);

  const applyItalic = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
  }, [editor]);

  const applyUnderline = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
  }, [editor]);

  const applyInlineCode = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
  }, [editor]);

  const toggleBulletedList = useCallback(() => {
    if (toolbarState.listType === 'bullet') {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  }, [editor, toolbarState.listType]);

  const toggleNumberedList = useCallback(() => {
    if (toolbarState.listType === 'number') {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
  }, [editor, toolbarState.listType]);

  const toggleCodeBlock = useCallback(() => {
    editor.dispatchCommand(TOGGLE_CODE_BLOCK_COMMAND, undefined);
  }, [editor]);

  const toggleBlockquote = useCallback(() => {
    editor.dispatchCommand(TOGGLE_BLOCKQUOTE_COMMAND, undefined);
  }, [editor]);

  const toolbarActions = useMemo<ToolbarAction[]>(
    () => [
      {
        id: 'bold',
        icon: <Bold className="h-4 w-4" />,
        label: 'Bold (Cmd/Ctrl+B)',
        formatter: applyBold,
      },
      {
        id: 'italic',
        icon: <Italic className="h-4 w-4" />,
        label: 'Italic (Cmd/Ctrl+I)',
        formatter: applyItalic,
      },
      {
        id: 'underline',
        icon: <Underline className="h-4 w-4" />,
        label: 'Underline (Cmd/Ctrl+U)',
        formatter: applyUnderline,
      },
      {
        id: 'bullet',
        icon: <List className="h-4 w-4" />,
        label: 'Bulleted list (Cmd/Ctrl+Shift+8)',
        formatter: toggleBulletedList,
      },
      {
        id: 'numbered',
        icon: <ListOrdered className="h-4 w-4" />,
        label: 'Numbered list (Cmd/Ctrl+Shift+7)',
        formatter: toggleNumberedList,
      },
      {
        id: 'blockquote',
        icon: <Quote className="h-4 w-4" />,
        label: 'Blockquote (Cmd/Ctrl+Shift+9)',
        formatter: toggleBlockquote,
      },
      {
        id: 'inlineCode',
        icon: <Code className="h-4 w-4" />,
        label: 'Inline code (Cmd/Ctrl+E)',
        formatter: applyInlineCode,
      },
      {
        id: 'codeBlock',
        icon: <CodeSquare className="h-4 w-4" />,
        label: 'Code block (Cmd/Ctrl+Shift+E)',
        formatter: toggleCodeBlock,
      },
    ], [
      applyBold,
      applyInlineCode,
      applyItalic,
      applyUnderline,
      toggleBlockquote,
      toggleBulletedList,
      toggleCodeBlock,
      toggleNumberedList,
    ],
  );

  const languageOptions = useMemo(() => {
    const options = getCodeLanguageOptions();
    return options.map(([value, label]) => ({ value, label }));
  }, []);

  const handleLanguageChange = useCallback(
    (next: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const element = selection.anchor.getNode().getTopLevelElementOrThrow();
        if ($isCodeNode(element)) {
          element.setLanguage(next === AUTO_CODE_LANGUAGE ? undefined : next);
        }
      });
      setToolbarState((prev) => ({
        ...prev,
        codeLanguage: next === AUTO_CODE_LANGUAGE ? '' : next,
      }));
    },
    [editor],
  );

  return (
    <div className="flex items-center justify-between border-b border-[var(--agyn-border-subtle)] px-2 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {toolbarActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] disabled:cursor-not-allowed disabled:opacity-50"
            title={action.label}
            aria-label={action.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => action.formatter()}
            disabled={disabled}
            data-testid={`markdown-composer-toolbar-${action.id}`}
          >
            {action.icon}
          </button>
        ))}

        {toolbarState.blockType === 'code' ? (
          <div
            className="ml-2 flex items-center gap-1"
            data-testid="markdown-composer-toolbar-code-language"
          >
            <Dropdown
              size="sm"
              variant="flat"
              placeholder="Language"
              value={toolbarState.codeLanguage || AUTO_CODE_LANGUAGE}
              onValueChange={handleLanguageChange}
              options={[{ value: AUTO_CODE_LANGUAGE, label: 'Auto' }, ...languageOptions]}
              disabled={disabled}
              className="w-[140px]"
            />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] disabled:cursor-not-allowed disabled:opacity-50"
        title="Open fullscreen markdown editor"
        aria-label="Open fullscreen markdown editor"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpenFullscreen}
        disabled={disabled}
        data-testid="markdown-composer-toolbar-fullscreen"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function MarkdownComposerRTE({
  value,
  onChange,
  placeholder = 'Type a message...',
  disabled = false,
  minLines = 1,
  maxLines = 8,
  sendDisabled = false,
  isSending = false,
  onSend,
  className = '',
  textareaAriaLabel,
  textareaProps,
}: MarkdownComposerRTEProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const maxLength = textareaProps?.maxLength;
  const ariaDescribedBy = textareaProps?.['aria-describedby'];
  const ariaLabelledBy = textareaProps?.['aria-labelledby'];
  const editorId = textareaProps?.id;
  const sendButtonDisabled = disabled || Boolean(sendDisabled) || Boolean(isSending);
  const ariaLabel = textareaAriaLabel ?? placeholder;

  const initialConfig = useMemo(
    () => ({
      namespace: 'MarkdownComposer',
      theme: MARKDOWN_COMPOSER_THEME,
      editable: !disabled,
      onError: (error: unknown) => {
        throw error;
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        CodeNode,
        CodeHighlightNode,
        LinkNode,
      ],
    }),
    [disabled],
  );

  const minHeight = minLines * 20;
  const maxHeight = typeof maxLines === 'number' ? maxLines * 20 : undefined;

  const handleSend = useCallback(() => {
    if (!onSend || sendButtonDisabled) {
      return;
    }
    onSend();
  }, [onSend, sendButtonDisabled]);

  return (
    <div className={`rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white ${className}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <MarkdownComposerToolbar
          disabled={disabled}
          onOpenFullscreen={() => setIsFullscreenOpen(true)}
        />
        <div className="relative p-2">
          <MarkdownComposerEditable
            placeholder={placeholder}
            minHeight={minHeight}
            maxHeight={maxHeight}
            ariaLabel={ariaLabel}
            ariaDescribedBy={ariaDescribedBy}
            ariaLabelledBy={ariaLabelledBy}
            id={editorId}
            disabled={disabled}
          />
          {onSend ? (
            <IconButton
              icon={isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              variant="primary"
              size="sm"
              className="absolute bottom-2 right-2"
              onClick={handleSend}
              disabled={sendButtonDisabled}
              aria-label="Send message"
              title="Send message"
              aria-busy={isSending || undefined}
            />
          ) : null}
        </div>
        <MarkdownComposerEditableStatePlugin editable={!disabled} />
        <MarkdownComposerCodeHighlightPlugin />
        <MarkdownComposerMarkdownPlugin
          markdown={value}
          onMarkdownChange={onChange}
          maxLength={maxLength}
        />
        <MarkdownComposerFormatPlugin />
        <MarkdownComposerKeymapPlugin
          disabled={disabled}
          onSend={handleSend}
          sendDisabled={sendButtonDisabled}
        />
        <HistoryPlugin />
        <ListPlugin />
        <MarkdownShortcutPlugin transformers={MARKDOWN_COMPOSER_TRANSFORMERS} />
      </LexicalComposer>

      {isFullscreenOpen && !disabled ? (
        <FullscreenMarkdownEditor
          value={value}
          onChange={(nextValue) => onChange(nextValue)}
          onClose={() => setIsFullscreenOpen(false)}
          label="Message"
        />
      ) : null}
    </div>
  );
}

export type { MarkdownComposerRTEProps as MarkdownComposerProps };
