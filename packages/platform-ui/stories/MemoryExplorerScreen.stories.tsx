import { useEffect, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MemoryExplorerScreen from '../src/components/screens/MemoryExplorerScreen';
import { withMainLayout } from './decorators/withMainLayout';
import { memoryApi } from '../src/api/modules/memory';
import { memoryPathParent, normalizeMemoryPath } from '../src/components/memory/path';

type MemoryExplorerProps = React.ComponentProps<typeof MemoryExplorerScreen>;

type DirectoryNode = { kind: 'dir' };
type DocumentNode = { kind: 'doc'; content: string };
type MemoryNode = DirectoryNode | DocumentNode;

type MemoryEntries = Map<string, MemoryNode>;
type MemoryChildren = Map<string, Set<string>>;

type MemoryApiMock = {
  install: () => () => void;
};

const meta: Meta<typeof MemoryExplorerScreen> = {
  title: 'Screens/Memory Explorer',
  component: MemoryExplorerScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof MemoryExplorerScreen>;

function createMemoryApiMock(): MemoryApiMock {
  const entries: MemoryEntries = new Map();
  const children: MemoryChildren = new Map();

  const ensureChildrenSet = (path: string) => {
    if (!children.has(path)) {
      children.set(path, new Set());
    }
    return children.get(path)!;
  };

  const ensureDir = (inputPath: string): void => {
    const path = normalizeMemoryPath(inputPath);
    const existing = entries.get(path);
    if (existing && existing.kind === 'doc') {
      throw new Error(`Cannot convert document to directory: ${path}`);
    }
    if (!existing) {
      entries.set(path, { kind: 'dir' });
    }
    ensureChildrenSet(path);
    const parent = memoryPathParent(path);
    if (parent !== path) {
      ensureDir(parent);
      ensureChildrenSet(parent).add(path);
    }
  };

  const setDocument = (inputPath: string, content: string): void => {
    const path = normalizeMemoryPath(inputPath);
    const parent = memoryPathParent(path);
    ensureDir(parent);
    entries.set(path, { kind: 'doc', content });
    ensureChildrenSet(parent).add(path);
  };

  const removeNode = (inputPath: string): number => {
    const path = normalizeMemoryPath(inputPath);
    if (path === '/') {
      return 0;
    }
    const node = entries.get(path);
    if (!node) {
      return 0;
    }
    let removed = 1;
    if (node.kind === 'dir') {
      const childPaths = Array.from(ensureChildrenSet(path));
      for (const child of childPaths) {
        removed += removeNode(child);
      }
      children.delete(path);
    }
    entries.delete(path);
    const parent = memoryPathParent(path);
    if (parent !== path) {
      ensureChildrenSet(parent).delete(path);
    }
    return removed;
  };

  const listEntries: typeof memoryApi.list = async (_nodeId, _scope, _threadId, inputPath) => {
    const path = normalizeMemoryPath(inputPath);
    const childPaths = Array.from(children.get(path) ?? []);
    const items = childPaths.map((childPath) => {
      const node = entries.get(childPath);
      const name = childPath === '/' ? '/' : childPath.split('/').filter(Boolean).pop() ?? '/';
      const hasSubdocs = node?.kind === 'dir' ? (children.get(childPath)?.size ?? 0) > 0 : false;
      return { name, hasSubdocs };
    });
    return { items };
  };

  const statPath: typeof memoryApi.stat = async (_nodeId, _scope, _threadId, inputPath) => {
    const path = normalizeMemoryPath(inputPath);
    const node = entries.get(path);
    if (!node) {
      return { exists: false, hasSubdocs: false, contentLength: 0 };
    }
    if (node.kind === 'dir') {
      const childCount = children.get(path)?.size ?? 0;
      return { exists: true, hasSubdocs: childCount > 0, contentLength: 0 };
    }
    return { exists: true, hasSubdocs: false, contentLength: node.content.length };
  };

  const readPath: typeof memoryApi.read = async (_nodeId, _scope, _threadId, inputPath) => {
    const path = normalizeMemoryPath(inputPath);
    const node = entries.get(path);
    if (!node) {
      throw new Error('Document not found');
    }
    if (node.kind !== 'doc') {
      throw new Error('Path is a directory');
    }
    return { content: node.content };
  };

  const appendToPath: typeof memoryApi.append = async (_nodeId, _scope, _threadId, inputPath, data) => {
    const path = normalizeMemoryPath(inputPath);
    const parent = memoryPathParent(path);
    ensureDir(parent);
    const existing = entries.get(path);
    if (existing && existing.kind === 'dir') {
      throw new Error('Cannot append to a directory');
    }
    if (existing && existing.kind === 'doc') {
      existing.content = existing.content ? `${existing.content}\n${data}` : data;
    } else {
      entries.set(path, { kind: 'doc', content: data });
      ensureChildrenSet(parent).add(path);
    }
  };

  const updatePath: typeof memoryApi.update = async (_nodeId, _scope, _threadId, inputPath, _oldStr, newStr) => {
    const path = normalizeMemoryPath(inputPath);
    const parent = memoryPathParent(path);
    ensureDir(parent);
    const node = entries.get(path);
    if (node && node.kind === 'dir') {
      throw new Error('Cannot update a directory');
    }
    entries.set(path, { kind: 'doc', content: newStr });
    ensureChildrenSet(parent).add(path);
    return { replaced: 1 };
  };

  const ensureDirPath: typeof memoryApi.ensureDir = async (_nodeId, _scope, _threadId, inputPath) => {
    ensureDir(inputPath);
  };

  const deletePath: typeof memoryApi.delete = async (_nodeId, _scope, _threadId, inputPath) => {
    const path = normalizeMemoryPath(inputPath);
    if (path === '/') {
      throw new Error('Cannot delete root');
    }
    const removed = removeNode(path);
    return { removed };
  };

  // seed initial tree content
  ensureDir('/');
  ensureDir('/projects');
  ensureDir('/projects/alpha');
  ensureDir('/projects/beta');
  ensureDir('/archives');
  ensureDir('/archives/2023');
  ensureDir('/resources');

  setDocument('/projects/alpha/notes.md', '# Alpha project notes\n\n- Investigate retrieval enhancements\n- Prepare sprint demo outline');
  setDocument('/projects/alpha/ideas.md', '## Idea log\n1. Incorporate RAG for summaries\n2. Capture evaluation metrics inline');
  setDocument('/projects/beta/todo.md', '* Stabilize beta agent pipeline\n* Add integration tests for connectors');
  setDocument('/journal.md', '## Daily journal\n- Captured learning outcomes\n- Planned next exploration session');
  setDocument('/archives/2023/highlights.md', '### 2023 Highlights\n- Completed initial memory explorer prototype\n- Documented API contract revisions');
  setDocument('/resources/checklist.md', '- Sync with evaluation squad\n- Refresh docs for new onboarding');

  const overrides = {
    list: listEntries,
    stat: statPath,
    read: readPath,
    append: appendToPath,
    update: updatePath,
    ensureDir: ensureDirPath,
    delete: deletePath,
  } satisfies Partial<typeof memoryApi>;

  return {
    install: () => {
      const originals = {
        list: memoryApi.list,
        stat: memoryApi.stat,
        read: memoryApi.read,
        append: memoryApi.append,
        update: memoryApi.update,
        ensureDir: memoryApi.ensureDir,
        delete: memoryApi.delete,
      };

      memoryApi.list = overrides.list!;
      memoryApi.stat = overrides.stat!;
      memoryApi.read = overrides.read!;
      memoryApi.append = overrides.append!;
      memoryApi.update = overrides.update!;
      memoryApi.ensureDir = overrides.ensureDir!;
      memoryApi.delete = overrides.delete!;

      return () => {
        memoryApi.list = originals.list;
        memoryApi.stat = originals.stat;
        memoryApi.read = originals.read;
        memoryApi.append = originals.append;
        memoryApi.update = originals.update;
        memoryApi.ensureDir = originals.ensureDir;
        memoryApi.delete = originals.delete;
      };
    },
  };
}

function MemoryExplorerStoryWrapper(props: MemoryExplorerProps) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      }),
    [],
  );

  const mock = useMemo(() => createMemoryApiMock(), []);

  useEffect(() => {
    const restore = mock.install();
    return () => {
      restore();
      queryClient.clear();
    };
  }, [mock, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryExplorerScreen {...props} />
    </QueryClientProvider>
  );
}

export const Default: Story = {
  args: {
    nodeId: 'demo-node',
    scope: 'global',
    initialPath: '/projects/alpha/notes.md',
    onPathChange: (nextPath: string) => console.info('Path changed to', nextPath),
  },
  render: (args) => <MemoryExplorerStoryWrapper {...args} />,
};
