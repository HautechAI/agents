import React from 'react';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { Conversation, type Run } from '../Conversation';
import { waitForStableScrollHeight } from '../agents/waitForStableScrollHeight';

vi.mock('../agents/waitForStableScrollHeight', () => ({
  waitForStableScrollHeight: vi.fn(() => Promise.resolve()),
}));

vi.mock('../VirtualizedList', () => {
  const { forwardRef, useRef, useImperativeHandle, useMemo, useEffect } = React;

  const instances: any[] = [];

  const VirtualizedList = forwardRef(function MockVirtualizedList(props: any, ref) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const atBottomRef = useRef(true);
    const propsRef = useRef(props);
    propsRef.current = props;

    const scrollToIndexMock = useMemo(() => vi.fn(), []);
    const scrollToMock = useMemo(() => vi.fn(), []);

    const instanceRef = useRef<any | null>(null);
    if (!instanceRef.current) {
      instanceRef.current = {
        scrollToIndex: scrollToIndexMock,
        scrollTo: scrollToMock,
        setAtBottom(value: boolean) {
          atBottomRef.current = value;
          propsRef.current.onAtBottomChange?.(value);
        },
        getScroller: () => scrollerRef.current,
      };
      instances.push(instanceRef.current);
    }

    const { onAtBottomChange } = props;

    useImperativeHandle(ref, () => ({
      scrollToIndex: (...args: any[]) => {
        scrollToIndexMock(...args);
      },
      scrollTo: (...args: any[]) => {
        scrollToMock(...args);
      },
      getScrollerElement: () => scrollerRef.current,
      isAtBottom: () => atBottomRef.current,
    }));

    useEffect(() => {
      onAtBottomChange?.(atBottomRef.current);
      return () => {
        const index = instances.indexOf(instanceRef.current);
        if (index >= 0) {
          instances.splice(index, 1);
        }
      };
    }, [onAtBottomChange]);

    return (
      <div data-testid="mock-virtualized-list" ref={scrollerRef} style={{ overflowY: 'auto', height: '100%' }}>
        {props.items.map((item: unknown, index: number) => {
          const key = props.getItemKey ? props.getItemKey(item) : index;
          return <div key={key}>{props.renderItem(index, item)}</div>;
        })}
      </div>
    );
  });

  return {
    VirtualizedList,
    __virtualizedListMock: {
      getInstances: () => instances,
      clear: () => {
        instances.splice(0, instances.length);
      },
    },
  };
});

const waitForStableScrollHeightMock = vi.mocked(waitForStableScrollHeight);

type MockVirtualizedListInstance = {
  scrollToIndex: Mock;
  scrollTo: Mock;
  setAtBottom: (value: boolean) => void;
  getScroller: () => HTMLDivElement | null;
};

type VirtualizedListMockModule = {
  __virtualizedListMock: {
    getInstances: () => MockVirtualizedListInstance[];
    clear: () => void;
  };
};

let virtualizedListMockModule: VirtualizedListMockModule;

beforeAll(async () => {
  virtualizedListMockModule = (await import('../VirtualizedList')) as unknown as VirtualizedListMockModule;
});

function createRuns(): Run[] {
  return [
    {
      id: 'run-1',
      status: 'finished',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ],
    },
  ];
}

function getLatestInstance(): MockVirtualizedListInstance {
  const instances = virtualizedListMockModule.__virtualizedListMock.getInstances();
  expect(instances.length).toBeGreaterThan(0);
  return instances[instances.length - 1];
}

async function completeInitialHydration({
  rerender,
  instance,
  runs,
}: {
  rerender: (ui: React.ReactElement) => void;
  instance: MockVirtualizedListInstance;
  runs: Run[];
}) {
  await act(async () => {
    rerender(
      <Conversation
        threadId="thread-1"
        runs={runs}
        hydrationComplete
        isActive
      />,
    );
    await Promise.resolve();
  });

  const scroller = instance.getScroller();
  expect(scroller).not.toBeNull();
  expect(waitForStableScrollHeightMock).toHaveBeenCalledWith(scroller);
}

describe('Conversation auto-follow behavior', () => {
  beforeEach(() => {
    waitForStableScrollHeightMock.mockClear();
    waitForStableScrollHeightMock.mockImplementation(() => Promise.resolve());
    virtualizedListMockModule.__virtualizedListMock.clear();

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loader until the first scroll completes after hydration', async () => {
    const runs = createRuns();

    const { rerender } = render(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete={false} isActive />,
    );

    expect(screen.getByTestId('conversation-loader')).toBeInTheDocument();

    const instance = getLatestInstance();
    expect(instance.scrollToIndex).not.toHaveBeenCalled();

    await completeInitialHydration({ rerender, instance, runs });

    expect(instance.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(instance.scrollToIndex.mock.calls[0][0]).toMatchObject({ index: 1, align: 'end', behavior: 'auto' });
    expect(screen.getByTestId('conversation-loader')).toBeInTheDocument();

    act(() => {
      instance.setAtBottom(true);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });
  });

  it('auto-follows new messages when the viewer is at the bottom', async () => {
    const runs = createRuns();

    const { rerender } = render(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete={false} isActive />,
    );

    const instance = getLatestInstance();
    await completeInitialHydration({ rerender, instance, runs });

    act(() => {
      instance.setAtBottom(true);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });

    instance.scrollToIndex.mockClear();
    waitForStableScrollHeightMock.mockClear();

    const updatedRuns: Run[] = [
      {
        ...runs[0],
        messages: [
          ...runs[0].messages,
          { id: 'm3', role: 'assistant', content: 'A new reply' },
        ],
      },
    ];

    await act(async () => {
      rerender(
        <Conversation threadId="thread-1" runs={updatedRuns} hydrationComplete isActive />,
      );
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalledTimes(1);
    expect(instance.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(instance.scrollToIndex.mock.calls[0][0]).toMatchObject({ index: 1, align: 'end', behavior: 'auto' });
  });

  it('does not auto-follow when the viewer is not at the bottom', async () => {
    const runs = createRuns();

    const { rerender } = render(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete={false} isActive />,
    );

    const instance = getLatestInstance();
    await completeInitialHydration({ rerender, instance, runs });

    act(() => {
      instance.setAtBottom(false);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });

    instance.scrollToIndex.mockClear();
    waitForStableScrollHeightMock.mockClear();

    const updatedRuns: Run[] = [
      {
        ...runs[0],
        messages: [
          ...runs[0].messages,
          { id: 'm3', role: 'assistant', content: 'Another reply' },
        ],
      },
    ];

    await act(async () => {
      rerender(
        <Conversation threadId="thread-1" runs={updatedRuns} hydrationComplete isActive />,
      );
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(instance.scrollToIndex).not.toHaveBeenCalled();
  });
});
