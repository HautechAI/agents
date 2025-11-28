import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SendResult } from '../src/messaging/types';

vi.mock('@slack/web-api', () => {
  type ChatPostMessageArguments = { channel: string; text: string; thread_ts?: string };
  type ChatPostMessageResponse = { ok: boolean; channel?: string; ts?: string; message?: { thread_ts?: string } };
  let last: { token: string } | null = null;
  class WebClient {
    constructor(token: string) {
      last = { token };
    }
    chat = {
      postMessage: async (opts: ChatPostMessageArguments): Promise<ChatPostMessageResponse> => ({ ok: true, channel: opts.channel, ts: '1729', message: { thread_ts: opts.thread_ts || '1729' } }),
    };
  }
  return { WebClient, __getLastWebClient: () => last };
});

describe('SlackAdapter', () => {
  let runtime: LiveGraphRuntime;
  let adapter: SlackAdapter;
  let trigger: SlackTrigger;
  let sendSpy: ReturnType<typeof vi.fn>;

  class StubSlackTrigger extends SlackTrigger {
    constructor(private readonly spy: ReturnType<typeof vi.fn>) {
      super(undefined as any, {} as any, {} as any);
    }

    override get status(): 'ready' {
      return 'ready';
    }

    override async sendToChannel(threadId: string, text: string): Promise<SendResult> {
      return this.spy(threadId, text);
    }
  }

  beforeEach(() => {
    vi.resetAllMocks();
    sendSpy = vi.fn(async (threadId: string, text: string) => ({ ok: true, channelMessageId: '1729', threadId } as SendResult));
    trigger = new StubSlackTrigger(sendSpy);
    runtime = { getNodeInstance: vi.fn().mockReturnValue(trigger) } as unknown as LiveGraphRuntime;
    adapter = new SlackAdapter(runtime);
  });

  it('sends message successfully', async () => {
    const res = await adapter.sendText({ threadId: 'thread-1', text: 'hello', source: 'send_message', channelNodeId: 'node-1' });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('1729');
    expect((runtime.getNodeInstance as any)).toHaveBeenCalledWith('node-1');
    expect(sendSpy).toHaveBeenCalledWith('thread-1', 'hello');
  });
});
