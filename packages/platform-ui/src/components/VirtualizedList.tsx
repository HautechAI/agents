import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useRef, useEffect, useState, forwardRef, type ReactNode } from 'react';

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
  scrollerProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function VirtualizedList<T>({
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
  scrollerProps,
}: VirtualizedListProps<T>) {
  const shouldUseFallbackList =
    (typeof process !== 'undefined' && process.env?.VITEST === 'true') ||
    (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined');

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);
  const prevItemsLengthRef = useRef(items.length);
  const prevFirstItemKeyRef = useRef<string | number | null>(null);
  const isInitialMount = useRef(true);
  const [firstItemIndex, setFirstItemIndex] = useState(100000);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shouldUseFallbackList) {
      return;
    }

    const node = scrollerRef.current;
    if (!node) return;

    const applyScroll = () => {
      node.scrollTop = node.scrollHeight;
    };

    applyScroll();

    const hasWindow = typeof window !== 'undefined';
    const raf = hasWindow && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(() => {
          applyScroll();
        })
      : null;

    const timeouts: number[] = [];
    if (hasWindow) {
      timeouts.push(window.setTimeout(applyScroll, 0));
      timeouts.push(window.setTimeout(applyScroll, 16));
      timeouts.push(window.setTimeout(applyScroll, 32));
    }

    return () => {
      if (raf !== null && hasWindow && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(raf);
      }
      if (hasWindow) {
        timeouts.forEach((timeoutId) => {
          window.clearTimeout(timeoutId);
        });
      }
    };
  }, [items, shouldUseFallbackList]);

  // Handle initial scroll to bottom
  useEffect(() => {
    if (shouldUseFallbackList) {
      return;
    }

    if (isInitialMount.current && items.length > 0) {
      isInitialMount.current = false;
      setFirstItemIndex(Math.max(0, 100000 - items.length));
      if (getItemKey) {
        prevFirstItemKeyRef.current = getItemKey(items[0]);
      }
    }
  }, [items.length, items, getItemKey, shouldUseFallbackList]);

  // Detect when new items are added
  useEffect(() => {
    if (shouldUseFallbackList) {
      return;
    }

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
  }, [items, getItemKey, shouldUseFallbackList]);

  if (shouldUseFallbackList) {
    return (
      <div className={className} style={style}>
        {header}
        <div ref={scrollerRef} {...scrollerProps}>
          {items.length === 0 && emptyPlaceholder}
          {items.map((item, index) => (
            <div key={getItemKey ? getItemKey(item) : index}>{renderItem(index, item)}</div>
          ))}
        </div>
        {footer}
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
          return isAtBottom ? 'smooth' : false;
        }}
        atBottomStateChange={(isAtBottom) => {
          atBottomRef.current = isAtBottom;
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
          Scroller: scrollerProps
            ? forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
                <div ref={ref} {...props} {...scrollerProps} />
              ))
            : undefined,
        }}
      />
    </div>
  );
}
