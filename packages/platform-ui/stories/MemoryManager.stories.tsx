import { useArgs } from 'storybook/preview-api';
import type { Meta, StoryObj } from '@storybook/react';

import { MemoryManager } from '../src/components/memoryManager/MemoryManager';
import type { MemoryTree } from '../src/components/memoryManager/utils';
import { cloneTree } from '../src/components/memoryManager/utils';

const emptyTree: MemoryTree = {
  id: 'root',
  path: '/',
  name: '/',
  hasDocument: false,
  content: '',
  children: [],
};

const populatedTree: MemoryTree = {
  id: 'root',
  path: '/',
  name: '/',
  hasDocument: false,
  content: '',
  children: [
    {
      id: 'notes',
      path: '/notes',
      name: 'notes',
      hasDocument: false,
      content: '',
      children: [
        {
          id: 'notes-todo',
          path: '/notes/todo',
          name: 'todo',
          hasDocument: true,
          content: '# Todo list\n\n- Draft onboarding email\n- Schedule memory sync',
          children: [],
        },
      ],
    },
    {
      id: 'guides',
      path: '/guides',
      name: 'guides',
      hasDocument: true,
      content: 'Guides index',
      children: [
        {
          id: 'guides-getting-started',
          path: '/guides/getting-started',
          name: 'getting-started',
          hasDocument: true,
          content: `# Getting Started\n\n1. Install dependencies\n2. Launch Storybook\n3. Explore the Memory Manager UI`,
          children: [],
        },
      ],
    },
  ],
};

type MemoryManagerStoryArgs = {
  initialTree: MemoryTree;
  initialSelectedPath?: string;
  initialPreviewEnabled?: boolean;
  selectedPath?: string;
  previewEnabled?: boolean;
  editorValue?: string;
  showContentIndicators?: boolean;
};

const meta: Meta<typeof MemoryManager> = {
  title: 'Memory/MemoryManager',
  component: MemoryManager,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    initialTree: {
      control: 'object',
    },
    initialSelectedPath: {
      control: 'text',
    },
    initialPreviewEnabled: {
      control: 'boolean',
    },
    selectedPath: {
      control: 'text',
    },
    previewEnabled: {
      control: 'boolean',
    },
    editorValue: {
      control: 'text',
    },
    showContentIndicators: {
      control: 'boolean',
    },
  },
  args: {
    initialTree: cloneTree(emptyTree),
    initialSelectedPath: '/',
    selectedPath: '/',
    previewEnabled: false,
    editorValue: '',
    showContentIndicators: true,
  } satisfies MemoryManagerStoryArgs,
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

const renderWithState = (args: MemoryManagerStoryArgs) => {
  const [, updateArgs] = useArgs<MemoryManagerStoryArgs>();
  return (
    <div className="h-[640px] w-full bg-muted/10 p-4">
      <MemoryManager
        initialTree={args.initialTree}
        initialSelectedPath={args.initialSelectedPath}
        initialPreviewEnabled={args.initialPreviewEnabled}
        showContentIndicators={args.showContentIndicators ?? true}
        onTreeChange={(nextTree) => updateArgs({ initialTree: cloneTree(nextTree) })}
        onSelectPath={(path) => updateArgs({ selectedPath: path })}
        onEditorChange={(value) => updateArgs({ editorValue: value })}
        onPreviewChange={(preview) => updateArgs({ previewEnabled: preview })}
      />
    </div>
  );
};

export const DefaultEmptyTree: Story = {
  args: {
    initialTree: cloneTree(emptyTree),
    initialSelectedPath: '/',
  },
  render: renderWithState,
};

export const PopulatedTree: Story = {
  args: {
    initialTree: cloneTree(populatedTree),
    initialSelectedPath: '/notes/todo',
  },
  render: renderWithState,
};

export const EditingContent: Story = {
  args: {
    initialTree: cloneTree(populatedTree),
    initialSelectedPath: '/notes/todo',
    initialPreviewEnabled: false,
  },
  render: renderWithState,
  parameters: {
    docs: {
      description: {
        story: 'Focused on editing the `/notes/todo` document with live unsaved state feedback.',
      },
    },
  },
};

export const CreateChildNode: Story = {
  args: {
    initialTree: cloneTree(emptyTree),
    initialSelectedPath: '/',
  },
  render: renderWithState,
  parameters: {
    docs: {
      description: {
        story: 'Use the “Add child” action or press the A key to create a new node beneath the selected path.',
      },
    },
  },
};

export const DeleteConfirmation: Story = {
  args: {
    initialTree: cloneTree(populatedTree),
    initialSelectedPath: '/guides/getting-started',
  },
  render: renderWithState,
  parameters: {
    docs: {
      description: {
        story: 'Trigger the delete action to review the confirmation dialog and ensure descendant removal.',
      },
    },
  },
};

export const KeyboardNavigation: Story = {
  args: {
    initialTree: cloneTree(populatedTree),
    initialSelectedPath: '/notes',
    showContentIndicators: true,
  },
  render: renderWithState,
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates arrow-key navigation, Enter/Space selection, Delete prompts, and the A shortcut for creating nodes.',
      },
    },
  },
};
