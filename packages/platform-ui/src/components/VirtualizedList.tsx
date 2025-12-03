import { Virtuoso, type VirtuosoHandle, type StateSnapshot } from 'react-virtuoso';
import {
  useRef,
  useEffect,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useCallback,
  Component,
  type ReactNode,
  type ForwardedRef,
  type HTMLAttributes,
  type MutableRefObject,
  type Key,
  type ErrorInfo,
} from 'react';
import { debugConversation } from '@/lib/debug';

type ScrollToIndexArgs = Parameters<VirtuosoHandle['scrollToIndex']>;
type ScrollToIndexLocation = ScrollToIndexArgs[0];
type ScrollToIndexRest = ScrollToIndexArgs extends [unknown, ...infer R] ? R : never;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const sanitizeScrollPosition = (
  position: VirtualizedListScrollPosition | null | undefined,
  itemsLength: number,
): VirtualizedListScrollPosition | null => {
  if (!position) return null;

  const next: VirtualizedListScrollPosition = {};

  if (isFiniteNumber(position.index) && itemsLength > 0) {
    const raw = Math.floor(position.index as number);
    next.index = Math.max(0, Math.min(itemsLength - 1, raw));
  }

  if (isFiniteNumber(position.offset) && next.index !== undefined) {
    const offset = Math.max(0, position.offset as number);
    next.offset = offset;
  }

  if (isFiniteNumber(position.scrollTop)) {
    const scrollTop = Math.max(0, position.scrollTop as number);
    next.scrollTop = scrollTop;
  }

  if (position.atBottom === true) {
    next.atBottom = true;
  }

  if (next.index === undefined && next.scrollTop === undefined && !next.atBottom) {
    return null;
  }

  return next;
};

export interface VirtualizedListScrollPosition {
  index?: number;
  offset?: number;
  scrollTop?: number;
  atBottom?: boolean;
}

export interface VirtualizedListHandle {
  scrollToIndex: VirtuosoHandle['scrollToIndex'];
  scrollTo: VirtuosoHandle['scrollTo'];
  getScrollerElement: () => HTMLElement | null;
  isAtBottom: () => boolean;
  captureScrollPosition: () => Promise<VirtualizedListScrollPosition | null>;
  restoreScrollPosition: (position: VirtualizedListScrollPosition) => void;
}

export interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (index: number, item: T) => ReactNode;
  getItemKey?: (item: T) => string | number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  emptyPlaceholder?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onAtBottomChange?: (isAtBottom: boolean) => void;
}

interface VirtualizedListErrorBoundaryProps {
  onError: (error: unknown, info: ErrorInfo) => void;
  children: ReactNode;
}

interface VirtualizedListErrorBoundaryState {
  hasError: boolean;
}

class VirtualizedListErrorBoundary extends Component<
  VirtualizedListErrorBoundaryProps,
  VirtualizedListErrorBoundaryState
> {
  constructor(props: VirtualizedListErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): VirtualizedListErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError(error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function VirtualizedListInner<T>(
  {
    items,
    renderItem,
    getItemKey,
    hasMore = false,
    isLoadingMore = false,
    onLoadMore = () => {},
    header,
    footer,
    emptyPlaceholder,
    className,
    style,
    onAtBottomChange,
  }: VirtualizedListProps<T>,
  ref: ForwardedRef<VirtualizedListHandle>,
) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const virtuosoPatchedRef = useRef(false);
  const virtuosoOriginalScrollRef = useRef<VirtuosoHandle['scrollToIndex'] | null>(null);
  const atBottomRef = useRef(true);
  const prevItemsLengthRef = useRef(items.length);
  const prevFirstItemKeyRef = useRef<string | number | null>(null);
  const isInitialMount = useRef(true);
  const [firstItemIndex, setFirstItemIndex] = useState(() => Math.max(0, 100000 - items.length));
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [virtuosoVersion, setVirtuosoVersion] = useState(0);

  const attachVirtuosoRef = useCallback(
    (instance: VirtuosoHandle | null) => {
      virtuosoRef.current = instance;

      if (!instance) {
        if (virtuosoOriginalScrollRef.current) {
          virtuosoOriginalScrollRef.current = null;
        }
        virtuosoPatchedRef.current = false;
        return;
      }

      if (virtuosoPatchedRef.current) {
        return;
      }

      const originalScrollToIndex = instance.scrollToIndex.bind(instance) as (...args: ScrollToIndexArgs) => void;
      virtuosoOriginalScrollRef.current = originalScrollToIndex;

      const patchedScrollToIndex: VirtuosoHandle['scrollToIndex'] = ((
        location: ScrollToIndexLocation | null | undefined,
        ...rest: ScrollToIndexRest
      ) => {
        if (location === undefined || location === null) {
          debugConversation('virtualized-list.scrollToIndex.patch.skip-null', () => ({ items: items.length }));
          return;
        }
        const args = [location, ...rest] as ScrollToIndexArgs;
        originalScrollToIndex(...args);
      }) as VirtuosoHandle['scrollToIndex'];

      instance.scrollToIndex = patchedScrollToIndex;
      virtuosoPatchedRef.current = true;
    },
    [items.length],
  );

  const handleVirtualizationError = useCallback(
    (error: unknown, info: ErrorInfo) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      debugConversation('virtualized-list.error-boundary', () => ({
        items: items.length,
        message,
        stack,
        componentStack: info?.componentStack,
      }));
      setVirtuosoVersion((version) => version + 1);
    },
    [items.length],
  );

  useEffect(() => {
    if (isInitialMount.current && items.length > 0) {
      isInitialMount.current = false;
      const baseIndex = Math.max(0, 100000 - items.length);
      setFirstItemIndex(baseIndex);
      if (getItemKey) {
        prevFirstItemKeyRef.current = getItemKey(items[0]);
      }
    }
  }, [items.length, items, getItemKey]);

  useEffect(() => {
    if (isInitialMount.current || items.length === 0) {
      return;
    }

    const prevLength = prevItemsLengthRef.current;
    const currentLength = items.length;
    const currentFirstItemKey = getItemKey ? getItemKey(items[0]) : null;

    if (currentLength > prevLength) {
      if (getItemKey && currentFirstItemKey !== prevFirstItemKeyRef.current) {
        const itemsAdded = currentLength - prevLength;
        setFirstItemIndex((prev) => prev - itemsAdded);
        prevFirstItemKeyRef.current = currentFirstItemKey;
      }
    }

    prevItemsLengthRef.current = currentLength;
  }, [items, getItemKey]);

  const renderVirtualItem = useCallback(
    (index: number, item: T): ReactNode => {
      const arrayIndex = index - firstItemIndex;
      return renderItem(arrayIndex, item);
    },
    [firstItemIndex, renderItem],
  );

  const resolveVirtualItemKey = useCallback(
    (index: number, item: T, _context?: unknown): Key => (getItemKey ? getItemKey(item) : index),
    [getItemKey],
  );

  const captureScrollPosition = useCallback(async () => {
    const instance = virtuosoRef.current;
    if (!instance) return null;
    return new Promise<VirtualizedListScrollPosition | null>((resolve) => {
      instance.getState((snapshot: StateSnapshot) => {
        const range = snapshot.ranges[0];
        const absoluteIndex = range ? range.startIndex : undefined;
        const scrollTop = snapshot.scrollTop;
        const hasRange = Number.isFinite(absoluteIndex);
        const hasScrollTop = Number.isFinite(scrollTop);

        if (!hasRange || !hasScrollTop) {
          debugConversation('virtualized-list.capture.virtuoso.unusable', () => ({ items: items.length, hasRange, hasScrollTop }));
          resolve(null);
          return;
        }

        const relative = (absoluteIndex as number) - firstItemIndex;
        const result: VirtualizedListScrollPosition = {};

        if (items.length > 0) {
          const clamped = Math.max(0, Math.min(items.length - 1, Math.floor(relative)));
          result.index = clamped;
        }

        result.scrollTop = scrollTop as number;

        if (atBottomRef.current) {
          result.atBottom = true;
        }

        const sanitized = sanitizeScrollPosition(result, items.length);
        if (!sanitized) {
          debugConversation('virtualized-list.capture.virtuoso.sanitized-null', () => ({ items: items.length }));
          resolve(null);
          return;
        }

        debugConversation('virtualized-list.capture.virtuoso', () => ({ items: items.length, sanitized }));
        resolve(sanitized);
      });
    });
  }, [firstItemIndex, items.length]);

  const restoreScrollPosition = useCallback(
    (position: VirtualizedListScrollPosition) => {
      if (!position) return;
      const sanitized = sanitizeScrollPosition(position, items.length);
      if (!sanitized) {
        debugConversation('virtualized-list.restore.skip', () => ({ items: items.length }));
        return;
      }

      const instance = virtuosoRef.current;
      if (!instance) {
        debugConversation('virtualized-list.restore.pending-instance', () => ({ items: items.length }));
        return;
      }

      const idx = sanitized.index;
      const top = sanitized.scrollTop;
      const offset = sanitized.offset;
      const wasAtBottom = sanitized.atBottom === true;
      const itemsLength = items.length;

      if (itemsLength === 0 && !Number.isFinite(top) && !wasAtBottom) {
        debugConversation('virtualized-list.restore.skip-empty', () => ({ items: items.length }));
        return;
      }

      if (Number.isFinite(idx) && itemsLength > 0) {
        const raw = Math.floor(idx as number);
        const clampedIndex = Math.max(0, Math.min(itemsLength - 1, raw));
        const absoluteIndex = firstItemIndex + clampedIndex;
        const location: { index: number; align: 'start'; behavior: 'auto'; offset?: number } = {
          index: absoluteIndex,
          align: 'start',
          behavior: 'auto',
        };
        if (Number.isFinite(offset)) {
          location.offset = offset as number;
        }
        debugConversation('virtualized-list.restore.index', () => ({ items: items.length, location }));
        instance.scrollToIndex(location);
        return;
      }

      if (Number.isFinite(top)) {
        const topValue = top as number;
        debugConversation('virtualized-list.restore.scrollTop', () => ({ items: items.length, top: topValue }));
        instance.scrollTo({ top: topValue, behavior: 'auto' });
        return;
      }

      if (wasAtBottom && itemsLength > 0) {
        debugConversation('virtualized-list.restore.bottom', () => ({ items: items.length, firstItemIndex }));
        instance.scrollToIndex({ index: firstItemIndex + itemsLength - 1, align: 'end', behavior: 'auto' });
        return;
      }

      debugConversation('virtualized-list.restore.unhandled', () => ({ items: items.length }));
    },
    [firstItemIndex, items.length],
  );

  useImperativeHandle(
    ref,
    () =>
      ({
        scrollToIndex: (...args: Parameters<VirtuosoHandle['scrollToIndex']>) => {
          const [location] = args;
          if (location === undefined || location === null) {
            debugConversation('virtualized-list.scrollToIndex.skip-null', () => ({ items: items.length }));
            return;
          }
          const instance = virtuosoRef.current;
          if (!instance) {
            debugConversation('virtualized-list.scrollToIndex.no-instance', () => ({ items: items.length }));
            return;
          }

          debugConversation('virtualized-list.scrollToIndex.request', () => ({ items: items.length, location }));

          const clampRelativeIndex = (value: unknown): number | null => {
            if (items.length === 0) {
              return null;
            }
            if (value === 'LAST') {
              return items.length - 1;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
              const raw = Math.floor(value);
              return Math.max(0, Math.min(items.length - 1, raw));
            }
            return null;
          };

          const resolveAbsoluteLocation = (
            target: ScrollToIndexLocation | 'LAST',
          ): ScrollToIndexLocation | null => {
            if (target === null || target === undefined) {
              return null;
            }

            if (target === 'LAST') {
              const relative = clampRelativeIndex('LAST');
              if (relative === null) return null;
              return firstItemIndex + relative;
            }

            if (typeof target === 'number') {
              const relative = clampRelativeIndex(target);
              if (relative === null) return null;
              return firstItemIndex + relative;
            }

            if (typeof target === 'object') {
              const locationTarget = target as { index?: unknown };
              const relative = clampRelativeIndex(locationTarget.index);
              if (relative === null) return null;
              return { ...target, index: firstItemIndex + relative };
            }

            return null;
          };

          const resolved = resolveAbsoluteLocation(location);
          if (resolved === null) {
            debugConversation('virtualized-list.scrollToIndex.invalid-location', () => ({ items: items.length, location }));
            return;
          }

          const [, ...rest] = args as ScrollToIndexArgs;
          const finalArgs = [resolved, ...rest] as ScrollToIndexArgs;
          instance.scrollToIndex(...finalArgs);
        },
        scrollTo: (...args) => {
          virtuosoRef.current?.scrollTo(...args);
        },
        getScrollerElement: () => scrollerRef.current,
        isAtBottom: () => atBottomRef.current,
        captureScrollPosition: () => captureScrollPosition(),
        restoreScrollPosition: (position) => {
          if (position) restoreScrollPosition(position);
        },
      }) as VirtualizedListHandle,
    [captureScrollPosition, firstItemIndex, items.length, restoreScrollPosition],
  );

  const Scroller = useMemo(
    () =>
      forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function VirtualizedListScroller(props, forward) {
        const { itemKey: _ignoredItemKey, ...rest } = props as HTMLAttributes<HTMLDivElement> & { itemKey?: unknown };
        return (
          <div
            {...rest}
            ref={(node) => {
              scrollerRef.current = node ?? null;
              if (typeof forward === 'function') {
                forward(node);
              } else if (forward) {
                (forward as MutableRefObject<HTMLDivElement | null>).current = node;
              }
            }}
          />
        );
      }),
    [],
  );

  return (
    <div className={className} style={style}>
      <VirtualizedListErrorBoundary key={virtuosoVersion} onError={handleVirtualizationError}>
        <Virtuoso
          ref={attachVirtuosoRef}
          data={items}
          totalCount={firstItemIndex + items.length}
          firstItemIndex={firstItemIndex}
          itemContent={renderVirtualItem}
          computeItemKey={resolveVirtualItemKey}
          components={{
            Header: header ? () => <>{header}</> : undefined,
            Footer: footer ? () => <>{footer}</> : undefined,
            EmptyPlaceholder: emptyPlaceholder ? () => <>{emptyPlaceholder}</> : undefined,
            Scroller,
          }}
          followOutput={(isAtBottom) => {
            atBottomRef.current = isAtBottom;
            return isAtBottom ? 'auto' : false;
          }}
          atBottomStateChange={(isAtBottom) => {
            atBottomRef.current = isAtBottom;
            onAtBottomChange?.(isAtBottom);
          }}
          startReached={() => {
            if (hasMore && !isLoadingMore) {
              onLoadMore();
            }
          }}
        />
      </VirtualizedListErrorBoundary>
    </div>
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & { ref?: ForwardedRef<VirtualizedListHandle> },
) => React.ReactElement;
