import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThreadSoundController } from '../ThreadSoundController';

const ROOT_ID = 'root-thread';

const createController = (
  overrides: Partial<ConstructorParameters<typeof ThreadSoundController>[0]> = {},
) => {
  const playNewMessage = vi.fn();
  const playFinished = vi.fn();
  const controller = new ThreadSoundController({
    delayMs: 100,
    playNewMessage,
    playFinished,
    isRootThread: (threadId) => threadId === ROOT_ID,
    ...overrides,
  });
  return { controller, playNewMessage, playFinished };
};

describe('ThreadSoundController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('plays new message sound after the delay for root threads', () => {
    const { controller, playNewMessage } = createController();

    controller.handleMessageCreated(ROOT_ID);

    expect(playNewMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(playNewMessage).toHaveBeenCalledTimes(1);
  });

  it('cancels pending new message sound when thread finishes first', () => {
    const { controller, playNewMessage, playFinished } = createController();

    controller.handleMessageCreated(ROOT_ID);
    controller.handleThreadFinished(ROOT_ID);

    expect(playFinished).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    expect(playNewMessage).not.toHaveBeenCalled();
  });

  it('ignores non-root threads for both message and finish events', () => {
    const { controller, playNewMessage, playFinished } = createController();

    controller.handleMessageCreated('child-thread');
    controller.handleThreadFinished('child-thread');

    vi.advanceTimersByTime(200);

    expect(playNewMessage).not.toHaveBeenCalled();
    expect(playFinished).not.toHaveBeenCalled();
  });

  it('resets the timer when multiple messages arrive before the delay elapses', () => {
    const { controller, playNewMessage } = createController();

    controller.handleMessageCreated(ROOT_ID);
    vi.advanceTimersByTime(50);
    controller.handleMessageCreated(ROOT_ID);

    vi.advanceTimersByTime(75);
    expect(playNewMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(25);
    expect(playNewMessage).toHaveBeenCalledTimes(1);
  });

  it('clears timers on dispose', () => {
    const { controller, playNewMessage } = createController();

    controller.handleMessageCreated(ROOT_ID);
    controller.dispose();

    vi.advanceTimersByTime(150);

    expect(playNewMessage).not.toHaveBeenCalled();
  });
});
