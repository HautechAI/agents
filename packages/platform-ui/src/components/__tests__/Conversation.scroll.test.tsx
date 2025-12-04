import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Conversation } from '../Conversation';

describe('Conversation scroll handling', () => {
  it('forwards the scroll ref and invokes the onScroll handler', () => {
    const scrollRef = React.createRef<HTMLDivElement>();
    const handleScroll = vi.fn();

    render(
      <Conversation
        runs={[
          {
            id: 'run-1',
            status: 'finished',
            messages: [
              {
                id: 'msg-1',
                role: 'user',
                content: 'Hello world',
              },
            ],
          },
        ]}
        scrollRef={scrollRef}
        onScroll={handleScroll}
      />,
    );

    const scrollContainer = screen.getByTestId('conversation-scroll');
    expect(scrollRef.current).toBe(scrollContainer);

    fireEvent.scroll(scrollContainer, { target: { scrollTop: 42 } });
    expect(handleScroll).toHaveBeenCalledTimes(1);
  });
});
