import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConversationsHost } from '../ThreadsScreen';
import type { Run, QueuedMessageData, ReminderData } from '../../Conversation';

vi.mock('../../Conversation', () => {
  const { useRef } = React;
  let instanceCounter = 0;

  const ConversationComponent: React.FC<any> = (props) => {
    const instanceIdRef = useRef<number | null>(null);
    if (instanceIdRef.current === null) {
      instanceIdRef.current = instanceCounter++;
    }

    return (
      <div
        data-testid={`conversation-${props.threadId}`}
        data-active={props.isActive ? 'true' : 'false'}
        data-instance-id={instanceIdRef.current ?? -1}
      />
    );
  };

  const conversationMock = vi.fn(ConversationComponent);

  return {
    Conversation: conversationMock,
    __conversationMock: conversationMock,
  };
});

type ConversationMockModule = {
  __conversationMock: ReturnType<typeof vi.fn>;
};

let conversationMockModule: ConversationMockModule;

beforeAll(async () => {
  conversationMockModule = (await import('../../Conversation')) as unknown as ConversationMockModule;
});

beforeEach(() => {
  conversationMockModule.__conversationMock.mockClear();
});

function createRun(id: string): Run {
  return {
    id: `run-${id}`,
    status: 'finished',
    messages: [
      {
        id: `msg-${id}`,
        role: 'assistant',
        content: `Message for ${id}`,
      },
    ],
  };
}

const EMPTY_QUEUE: QueuedMessageData[] = [];
const EMPTY_REMINDERS: ReminderData[] = [];

describe('ConversationsHost', () => {
  it('caches up to 10 conversations using LRU eviction', async () => {
    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-1"
        runs={[createRun('1')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    let preservedInstanceId: string | null = null;

    for (let index = 2; index <= 12; index += 1) {
      const threadId = `thread-${index}`;

      await act(async () => {
        rerender(
          <ConversationsHost
            activeThreadId={threadId}
            runs={[createRun(String(index))]}
            queuedMessages={EMPTY_QUEUE}
            reminders={EMPTY_REMINDERS}
            hydrationComplete
            isRunsInfoCollapsed={false}
          />,
        );
        await Promise.resolve();
      });

      if (index === 5) {
        preservedInstanceId = screen
          .getByTestId('conversation-thread-5')
          .getAttribute('data-instance-id');
      }
    }

    expect(screen.queryByTestId('conversation-thread-1')).toBeNull();
    expect(screen.queryByTestId('conversation-thread-2')).toBeNull();

    const cachedItems = screen.getAllByTestId(/conversation-host-item-/);
    expect(cachedItems).toHaveLength(10);

    expect(screen.getByTestId('conversation-thread-5')).toBeInTheDocument();

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-5"
          runs={[createRun('5')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const revivedInstanceId = screen
      .getByTestId('conversation-thread-5')
      .getAttribute('data-instance-id');

    expect(revivedInstanceId).toBe(preservedInstanceId);
  });

  it('marks only the active conversation as visible', async () => {
    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-a"
        runs={[createRun('a')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-b"
          runs={[createRun('b')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const activeConversation = screen.getByTestId('conversation-thread-b');
    const inactiveConversation = screen.getByTestId('conversation-thread-a');

    expect(activeConversation.getAttribute('data-active')).toBe('true');
    expect(inactiveConversation.getAttribute('data-active')).toBe('false');
  });
});
