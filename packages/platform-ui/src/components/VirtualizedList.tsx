import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  useRef,
  useEffect,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useCallback,
  type ReactNode,
  type ForwardedRef,
  type HTMLAttributes,
  type MutableRefObject,
} from 'react';

export interface VirtualizedListHandle {
  scrollToIndex: VirtuosoHandle['scrollToIndex'];
  scrollTo: VirtuosoHandle['scrollTo'];
  getScrollerElement: () => HTMLElement | null;
  isAtBottom: () => boolean;
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
  followMode?: 'smooth' | 'auto' | false;
  onAtBottomChange?: (isAtBottom: boolean) => void;
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
  followMode = 'smooth',
  onAtBottomChange,
}: VirtualizedListProps<T>,
  ref: ForwardedRef<VirtualizedListHandle>,
) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);
  const prevItemsLengthRef = useRef(items.length);
  const prevFirstItemKeyRef = useRef<string | number | null>(null);
  const isInitialMount = useRef(true);
  const [firstItemIndex, setFirstItemIndex] = useState(100000);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const forceStatic = Boolean((globalThis as { __AGYN_DISABLE_VIRTUALIZATION__?: boolean }).__AGYN_DISABLE_VIRTUALIZATION__);

  // Handle initial scroll to bottom
  useEffect(() => {
    if (isInitialMount.current && items.length > 0) {
      isInitialMount.current = false;
      setFirstItemIndex(Math.max(0, 100000 - items.length));
      if (getItemKey) {
        prevFirstItemKeyRef.current = getItemKey(items[0]);
      }
    }
  }, [items.length, items, getItemKey]);

  // Detect when new items are added
  useEffect(() => {
    if (isInitialMount.current || items.length === 0) {
      return;
    }

    const prevLength = prevItemsLengthRef.current;
    const currentLength = items.length;
    const currentFirstItemKey = getItemKey ? getItemKey(items[0]) : null;
    
    if (currentLength > prevLength) {
      // Check if items were prepended (first item key changed)
      if (getItemKey && currentFirstItemKey !== prevFirstItemKeyRef.current) {
        const itemsAdded = currentLength - prevLength;
        setFirstItemIndex(prev => prev - itemsAdded);
        prevFirstItemKeyRef.current = currentFirstItemKey;
      }
      // If first item key is the same, items were appended - don't change firstItemIndex
    }
    
    prevItemsLengthRef.current = currentLength;
  }, [items, getItemKey]);

  const fallbackScrollToIndex = useCallback(
    (location: Parameters<VirtualizedListHandle['scrollToIndex']>[0]) => {
      if (!forceStatic) return;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const options = typeof location === 'number' ? { index: location } : location ?? { index: 0 };
      const index = options.index === 'LAST' ? items.length - 1 : options.index;
      if (typeof index !== 'number' || !Number.isFinite(index)) return;
      if (index < 0 || index >= items.length) return;
      const target = itemRefs.current[index];
      if (!target) return;
      const behavior = 'behavior' in options && options.behavior ? options.behavior : 'auto';
      const align = 'align' in options && options.align ? options.align : 'end';
      target.scrollIntoView({ behavior, block: align as ScrollLogicalPosition });
    },
    [forceStatic, items.length],
  );

  const fallbackScrollTo = useCallback(
    (location: Parameters<VirtualizedListHandle['scrollTo']>[0]) => {
      if (!forceStatic) return;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scroller.scrollTo(location);
    },
    [forceStatic],
  );

  useImperativeHandle(
    ref,
    () => {
      if (forceStatic) {
        return {
          scrollToIndex: (location) => fallbackScrollToIndex(location),
          scrollTo: (location) => fallbackScrollTo(location),
          getScrollerElement: () => scrollerRef.current,
          isAtBottom: () => atBottomRef.current,
        } as VirtualizedListHandle;
      }
      return {
        scrollToIndex: (...args) => {
          virtuosoRef.current?.scrollToIndex(...args);
        },
        scrollTo: (...args) => {
          virtuosoRef.current?.scrollTo(...args);
        },
        getScrollerElement: () => scrollerRef.current,
        isAtBottom: () => atBottomRef.current,
      } as VirtualizedListHandle;
    },
    [fallbackScrollTo, fallbackScrollToIndex, forceStatic],
  );

  useEffect(() => {
    if (!forceStatic) return;
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [forceStatic, items.length]);

  useEffect(() => {
    if (!forceStatic) return;
    if (followMode === false) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const behavior = followMode === 'smooth' ? 'smooth' : 'auto';
    scroller.scrollTo({ top: scroller.scrollHeight, behavior });
    const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1;
    if (isAtBottom !== atBottomRef.current) {
      atBottomRef.current = isAtBottom;
      onAtBottomChange?.(isAtBottom);
    }
  }, [followMode, forceStatic, items.length, onAtBottomChange]);

  useEffect(() => {
    if (!forceStatic) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1;
      if (isAtBottom !== atBottomRef.current) {
        atBottomRef.current = isAtBottom;
        onAtBottomChange?.(isAtBottom);
      }
    };

    handleScroll();

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
    };
  }, [forceStatic, onAtBottomChange, items.length]);

  const Scroller = useMemo(
    () =>
      forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function VirtualizedListScroller(props, forward) {
        return (
          <div
            {...props}
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

  if (forceStatic) {
    return (
      <div className={className} style={style}>
        <div
          ref={(node) => {
            scrollerRef.current = node ?? null;
          }}
          style={{ overflowY: 'auto', height: '100%' }}
        >
          {header}
          {items.length === 0 && emptyPlaceholder}
          {items.map((item, index) => {
            const key = getItemKey ? getItemKey(item) : index;
            return (
              <div
                key={key}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
              >
                {renderItem(index, item)}
              </div>
            );
          })}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <Virtuoso
        ref={virtuosoRef}
        data={items}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={firstItemIndex + items.length - 1}
        followOutput={(isAtBottom) => {
          atBottomRef.current = isAtBottom;
          if (followMode === 'smooth' || followMode === 'auto') {
            return isAtBottom ? followMode : false;
          }
          return false;
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
        itemContent={(index, item) => {
          const arrayIndex = index - firstItemIndex;
          return renderItem(arrayIndex, item);
        }}
        components={{
          Header: header ? () => <>{header}</> : undefined,
          Footer: footer ? () => <>{footer}</> : undefined,
          EmptyPlaceholder: emptyPlaceholder ? () => <>{emptyPlaceholder}</> : undefined,
          Scroller,
        }}
      />
    </div>
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & { ref?: ForwardedRef<VirtualizedListHandle> },
) => React.ReactElement;
