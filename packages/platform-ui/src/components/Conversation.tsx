import {
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import { Loader2 } from 'lucide-react';
import { waitForStableScrollHeight } from './agents/waitForStableScrollHeight';
import { VirtualizedList, type VirtualizedListHandle } from './VirtualizedList';
import { Message, type MessageRole } from './Message';
import { RunInfo } from './RunInfo';
import { QueuedMessage } from './QueuedMessage';
import { Reminder } from './Reminder';
import { StatusIndicator, type Status } from './StatusIndicator';

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: ReactNode;
  timestamp?: string;
}

export interface Run {
  id: string;
  messages: ConversationMessage[];
  status: 'finished' | 'running' | 'failed' | 'pending';
  duration?: string;
  tokens?: number;
  cost?: string;
  timelineHref?: string;
  onViewRun?: (runId: string) => void;
}

export interface QueuedMessageData {
  id: string;
  content: ReactNode;
}

export interface ReminderData {
  id: string;
  content: ReactNode;
  scheduledTime: string;
  date?: string;
}

interface ConversationProps {
  threadId: string;
  runs: Run[];
  hydrationComplete: boolean;
  isActive: boolean;
  queuedMessages?: QueuedMessageData[];
  reminders?: ReminderData[];
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  testId?: string | null;
}

type ConversationListItem =
  | { type: 'run'; run: Run; runIndex: number }
  | { type: 'queue' }
  | { type: 'spacer' };

export function Conversation({
  threadId,
  runs,
  hydrationComplete,
  isActive,
  queuedMessages = [],
  reminders = [],
  header,
  footer,
  className = '',
  defaultCollapsed = false,
  collapsed,
  testId,
}: ConversationProps) {
  const messagesRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const listHandleRef = useRef<VirtualizedListHandle | null>(null);
  const scrollRequestIdRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const initialScrollRequestedRef = useRef(false);
  const initialScrollCompletedRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const prevTotalMessageCountRef = useRef(0);
  const previousThreadIdRef = useRef<string | null>(threadId);
  const [runHeights, setRunHeights] = useState<Map<string, number>>(new Map());
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isLoaderVisible, setIsLoaderVisible] = useState(() => isActive && !hydrationComplete);

  const isCollapsed = collapsed ?? defaultCollapsed;
  const hasQueueOrReminders = queuedMessages.length > 0 || reminders.length > 0;
  const totalMessageCount = useMemo(() => runs.reduce((sum, run) => sum + run.messages.length, 0), [runs]);

  const conversationItems = useMemo<ConversationListItem[]>(() => {
    const items: ConversationListItem[] = runs.map((run, index) => ({ type: 'run', run, runIndex: index }));
    if (hasQueueOrReminders) {
      items.push({ type: 'queue' });
    }
    items.push({ type: 'spacer' });
    return items;
  }, [runs, hasQueueOrReminders]);

  useEffect(() => {
    const next = new Map<string, number>();
    const runIdSet = new Set(runs.map((run) => run.id));
    for (const run of runs) {
      const element = messagesRefs.current.get(run.id);
      if (element) {
        next.set(run.id, element.offsetHeight);
      }
    }
    for (const key of Array.from(messagesRefs.current.keys())) {
      if (!runIdSet.has(key)) {
        messagesRefs.current.delete(key);
      }
    }
    setRunHeights(next);
  }, [runs]);

  useLayoutEffect(() => {
    const scroller = listHandleRef.current?.getScrollerElement();
    if (!scroller) return;
    scroller.style.overflowAnchor = 'none';
    scroller.style.scrollBehavior = 'auto';
  }, [conversationItems.length]);

  useEffect(() => {
    if (previousThreadIdRef.current !== threadId) {
      previousThreadIdRef.current = threadId;
      prevTotalMessageCountRef.current = totalMessageCount;
    }
  }, [threadId, totalMessageCount]);

  useEffect(
    () => () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    },
    [],
  );

  const scrollToBottom = useCallback(async () => {
    const handle = listHandleRef.current;
    if (!handle) return;
    if (conversationItems.length === 0) {
      return;
    }

    const scroller = handle.getScrollerElement();
    const requestId = scrollRequestIdRef.current + 1;
    scrollRequestIdRef.current = requestId;

    if (scroller) {
      await waitForStableScrollHeight(scroller);
      if (scrollRequestIdRef.current !== requestId) {
        return;
      }
    }

    await new Promise<void>((resolve) => {
      rafIdRef.current = requestAnimationFrame(() => {
        if (scrollRequestIdRef.current !== requestId) {
          resolve();
          return;
        }
        handle.scrollToIndex({ index: conversationItems.length - 1, align: 'end', behavior: 'auto' });
        rafIdRef.current = null;
        resolve();
      });
    });
  }, [conversationItems.length]);

  useEffect(() => {
    if (!isActive) {
      setIsLoaderVisible(false);
      return;
    }

    if (!hydrationComplete) {
      if (!initialScrollCompletedRef.current) {
        setIsLoaderVisible(true);
      }
      return;
    }

    if (initialScrollCompletedRef.current) {
      setIsLoaderVisible(false);
      return;
    }

    if (!initialScrollRequestedRef.current) {
      if (totalMessageCount === 0 && !hasQueueOrReminders) {
        initialScrollRequestedRef.current = true;
        initialScrollCompletedRef.current = true;
        setIsLoaderVisible(false);
        return;
      }
      initialScrollRequestedRef.current = true;
      setIsLoaderVisible(true);
      void scrollToBottom();
      return;
    }

    if (isAtBottom) {
      initialScrollCompletedRef.current = true;
      setIsLoaderVisible(false);
    }
  }, [conversationItems.length, hydrationComplete, isActive, isAtBottom, scrollToBottom, totalMessageCount, hasQueueOrReminders]);

  useEffect(() => {
    if (!hydrationComplete || !isActive) {
      prevTotalMessageCountRef.current = totalMessageCount;
      return;
    }

    if (
      totalMessageCount > prevTotalMessageCountRef.current &&
      initialScrollCompletedRef.current &&
      isAtBottomRef.current
    ) {
      void scrollToBottom();
    }

    prevTotalMessageCountRef.current = totalMessageCount;
  }, [hydrationComplete, isActive, totalMessageCount, scrollToBottom]);

  const handleAtBottomChange = useCallback(
    (value: boolean) => {
      isAtBottomRef.current = value;
      setIsAtBottom(value);
      if (
        isActive &&
        hydrationComplete &&
        initialScrollRequestedRef.current &&
        !initialScrollCompletedRef.current
      ) {
        initialScrollCompletedRef.current = true;
        setIsLoaderVisible(false);
      }
    },
    [hydrationComplete, isActive],
  );

  const getItemKey = useCallback((item: ConversationListItem) => {
    if (item.type === 'run') return item.run.id;
    if (item.type === 'queue') return 'queue-section';
    return 'spacer';
  }, []);

  const getMessageContainerRef = useCallback(
    (runId: string) =>
      (element: HTMLDivElement | null) => {
        if (element) {
          messagesRefs.current.set(runId, element);
        } else {
          messagesRefs.current.delete(runId);
        }
      },
    [],
  );

  const renderItem = useCallback(
    (_index: number, item: ConversationListItem) => {
      if (item.type === 'run') {
        const { run, runIndex } = item;
        return (
          <div className="min-w-0">
            {runIndex > 0 ? <div className="border-t border-[var(--agyn-border-subtle)]" /> : null}
            <div className="flex min-w-0">
              <div className="flex-1 min-w-0 px-6 pt-6 pb-2">
                <div className="min-w-0" ref={getMessageContainerRef(run.id)}>
                  {run.messages.map((message) => (
                    <Message
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      timestamp={message.timestamp}
                    />
                  ))}
                </div>
              </div>
              <div
                className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 relative transition-[width] ${isCollapsed ? 'w-8' : 'w-[150px]'}`}
              >
                <div className={isCollapsed ? 'pt-6 pb-6 flex items-center justify-center' : 'pt-6 px-3 pb-6'}>
                  {isCollapsed ? (
                    <div
                      className="relative w-full"
                      style={{ height: `${runHeights.get(run.id) || 0}px` }}
                    >
                      <div className="sticky flex justify-center" style={{ top: '21px' }}>
                        <StatusIndicator status={run.status as Status} size="sm" />
                      </div>
                    </div>
                  ) : (
                    <RunInfo
                      runId={run.id}
                      status={run.status}
                      duration={run.duration}
                      tokens={run.tokens}
                      cost={run.cost}
                      height={runHeights.get(run.id) || 0}
                      runLink={run.timelineHref}
                      onViewRun={run.onViewRun}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (item.type === 'queue') {
        return (
          <div className="flex min-w-0">
            <div className="flex-1 min-w-0 px-6 pb-6">
              <div className="pt-6 min-w-0">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 border-t border-[var(--agyn-border-subtle)]" />
                  <span className="text-xs text-[var(--agyn-gray)] tracking-wider">PENDING</span>
                  <div className="flex-1 border-t border-[var(--agyn-border-subtle)]" />
                </div>
                <div className="space-y-3">
                  {queuedMessages.map((msg) => (
                    <QueuedMessage key={msg.id} content={msg.content} />
                  ))}
                  {reminders.map((reminder) => (
                    <Reminder
                      key={reminder.id}
                      content={reminder.content}
                      scheduledTime={reminder.scheduledTime}
                      date={reminder.date}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div
              className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 transition-[width] ${isCollapsed ? 'w-8' : 'w-[150px]'}`}
            />
          </div>
        );
      }

      return (
        <div className="flex-1 flex">
          <div className="flex-1" />
          <div
            className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 transition-[width] ${isCollapsed ? 'w-8' : 'w-[150px]'}`}
          />
        </div>
      );
    },
    [getMessageContainerRef, isCollapsed, queuedMessages, reminders, runHeights],
  );

  return (
    <div
      className={`flex flex-col h-full bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden ${className}`}
      data-testid={testId === null ? undefined : testId ?? 'conversation'}
      data-thread-id={threadId}
      data-hydrated={hydrationComplete ? 'true' : 'false'}
    >
      {header ? (
        <div className="px-6 py-4 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">{header}</div>
      ) : null}

      <div className="relative flex-1 min-h-0 min-w-0">
        <VirtualizedList
          ref={(handle) => {
            listHandleRef.current = handle;
          }}
          items={conversationItems}
          renderItem={renderItem}
          getItemKey={getItemKey}
          className="h-full"
          style={{ height: '100%' }}
          followMode={false}
          onAtBottomChange={handleAtBottomChange}
        />

        {isActive && isLoaderVisible ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80"
            data-testid="conversation-loader"
          >
            <Loader2 className="h-5 w-5 animate-spin text-[var(--agyn-gray)]" />
          </div>
        ) : null}
      </div>

      {footer ? (
        <div className="px-6 py-4 border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">{footer}</div>
      ) : null}
    </div>
  );
}
