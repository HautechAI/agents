import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react');
  const { forwardRef, useImperativeHandle, useMemo, useEffect, useRef, Fragment } = ReactModule;

  type Instance = {
    triggerStartReached: () => void;
    setAtBottom: (value: boolean) => void;
  };

  let latestInstance: Instance | null = null;

  const control = {
    getLatest(): Instance {
      if (!latestInstance) {
        throw new Error('Virtuoso instance not mounted');
      }
      return latestInstance;
    },
    reset(): void {
      latestInstance = null;
    },
  };

  const Virtuoso = forwardRef<any, any>((props, ref) => {
    const {
      data = [],
      itemContent,
      components = {},
      firstItemIndex = 0,
      followOutput,
      atBottomStateChange,
      startReached,
    } = props ?? {};

    const handle = useMemo(
      () => ({
        scrollToIndex: vi.fn(),
        scrollTo: vi.fn(),
        getState: (callback: (snapshot: unknown) => void) => {
          callback({
            ranges: [{ startIndex: firstItemIndex, endIndex: firstItemIndex + data.length }],
            scrollTop: 0,
          });
        },
      }),
      [data.length, firstItemIndex],
    );

    useImperativeHandle(ref, () => handle);

    const instanceRef = useRef<Instance>({
      triggerStartReached: () => {
        startReached?.();
      },
      setAtBottom: (value: boolean) => {
        const result = followOutput?.(value);
        if (result === 'auto') {
          atBottomStateChange?.(true);
        } else if (result === false) {
          atBottomStateChange?.(false);
        }
      },
    });

    instanceRef.current.triggerStartReached = () => {
      startReached?.();
    };
    instanceRef.current.setAtBottom = (value: boolean) => {
      const result = followOutput?.(value);
      if (result === 'auto') {
        atBottomStateChange?.(true);
      } else if (result === false) {
        atBottomStateChange?.(false);
      }
    };

    useEffect(() => {
      const current = instanceRef.current;
      latestInstance = current;
      return () => {
        if (latestInstance === current) {
          latestInstance = null;
        }
      };
    }, []);

    return (
      <div data-testid="mock-virtuoso">
        {typeof components.Header === 'function' ? components.Header() : null}
        {data.map((item: unknown, index: number) => (
          <Fragment key={firstItemIndex + index}>{itemContent(firstItemIndex + index, item)}</Fragment>
        ))}
        {typeof components.Footer === 'function' ? components.Footer() : null}
      </div>
    );
  });

  return { Virtuoso, __virtualizedControl: control };
});

import { VirtualizedList } from '../VirtualizedList';
import { __virtualizedControl } from 'react-virtuoso';

type VirtualizedControl = {
  getLatest: () => {
    triggerStartReached: () => void;
    setAtBottom: (value: boolean) => void;
  };
  reset: () => void;
};

const control = __virtualizedControl as unknown as VirtualizedControl;

describe('VirtualizedList virtualization mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    control.reset();
  });

  it('triggers onLoadMore via startReached while respecting loading state', async () => {
    const onLoadMore = vi.fn();
    const items = Array.from({ length: 12 }, (_, index) => `item-${index}`);
    const renderRow = (index: number, item: string) => (
      <div data-testid={`item-${index}`}>{item}</div>
    );
    const getKey = (item: string) => item;

    const { rerender } = render(
      <VirtualizedList
        className="virtualized-list-test"
        items={items}
        hasMore
        isLoadingMore={false}
        renderItem={renderRow}
        getItemKey={getKey}
        onLoadMore={onLoadMore}
      />,
    );

    await waitFor(() => {
      expect(() => control.getLatest()).not.toThrow();
    });

    let instance = control.getLatest();

    await act(async () => {
      instance.triggerStartReached();
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <VirtualizedList
        className="virtualized-list-test"
        items={items}
        hasMore
        isLoadingMore
        renderItem={renderRow}
        getItemKey={getKey}
        onLoadMore={onLoadMore}
      />,
    );

    instance = control.getLatest();

    await act(async () => {
      instance.triggerStartReached();
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    const prepended = ['prep-1', 'prep-0', ...items];

    rerender(
      <VirtualizedList
        className="virtualized-list-test"
        items={prepended}
        hasMore
        isLoadingMore={false}
        renderItem={renderRow}
        getItemKey={getKey}
        onLoadMore={onLoadMore}
      />,
    );

    instance = control.getLatest();

    await act(async () => {
      instance.triggerStartReached();
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

});
