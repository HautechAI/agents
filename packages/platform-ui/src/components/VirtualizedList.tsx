import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useRef, useEffect, useState, useCallback, forwardRef, type ReactNode, type MutableRefObject } from 'react';

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
  scrollerRef?: React.Ref<HTMLDivElement>;
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
  scrollerRef,
}: VirtualizedListProps<T>) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);
  const prevItemsLengthRef = useRef(items.length);
  const prevFirstItemKeyRef = useRef<string | number | null>(null);
  const isInitialMount = useRef(true);
  const [firstItemIndex, setFirstItemIndex] = useState(100000);

  const assignScrollerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!scrollerRef) return;
      if (typeof scrollerRef === 'function') {
        (scrollerRef as (instance: HTMLDivElement | null) => void)(node);
        return;
      }

      (scrollerRef as MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [scrollerRef],
  );

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

  const shouldCustomizeScroller = Boolean(scrollerProps || scrollerRef);

  const ScrollerComponent = shouldCustomizeScroller
    ? forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => {
        const { className: incomingClassName, ...restProps } = props;
        const { className: providedClassName, ...providedRest } = scrollerProps ?? {};
        const mergedClassName = [incomingClassName, providedClassName].filter(Boolean).join(' ');

        return (
          <div
            {...restProps}
            {...providedRest}
            className={mergedClassName}
            ref={(node) => {
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                (ref as MutableRefObject<HTMLDivElement | null>).current = node;
              }
              assignScrollerRef(node);
            }}
          />
        );
      })
    : undefined;

  if (ScrollerComponent) {
    (ScrollerComponent as unknown as { __agynProvidedScrollerProps?: React.HTMLAttributes<HTMLDivElement> }).__agynProvidedScrollerProps =
      scrollerProps ?? {};
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
          Scroller: ScrollerComponent,
        }}
      />
    </div>
  );
}
