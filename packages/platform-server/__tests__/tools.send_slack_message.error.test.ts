import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendSlackMessageNode } from '../src/nodes/tools/send_slack_message/send_slack_message.node';
import { SendSlackMessageFunctionTool } from '../src/nodes/tools/send_slack_message/send_slack_message.tool';
import { LoggerService } from '../src/core/services/logger.service';

const postMessageMock = vi.fn();
const postEphemeralMock = vi.fn();

vi.mock('@slack/web-api', () => {
  class WebClient {
    chat = {
      postEphemeral: postEphemeralMock,
      postMessage: postMessageMock,
    };
  }
  return { WebClient };
});

type VaultRef = import('../src/vault/vault.service').VaultRef;

function makeVault(): import('../src/vault/vault.service').VaultService {
  return {
    getSecret: vi.fn(async (_ref: VaultRef) => 'xoxb-static-token'),
  } as unknown as import('../src/vault/vault.service').VaultService;
}

async function makeTool() {
  const vault = makeVault();
  const node = new SendSlackMessageNode(new LoggerService(), vault);
  await node.setConfig({ bot_token: { value: 'xoxb-static-token', source: 'static' } });
  return new SendSlackMessageFunctionTool(node, new LoggerService(), vault);
}

describe('SendSlackMessageFunctionTool error normalization', () => {
  beforeEach(() => {
    postMessageMock.mockReset();
    postEphemeralMock.mockReset();
  });

  it('returns success envelope on happy path', async () => {
    postMessageMock.mockResolvedValue({ ok: true, channel: 'C1', ts: '111.222', message: { thread_ts: '111.222' } });
    const tool = await makeTool();
    const res = await tool.execute({
      channel: 'C1',
      text: 'hello',
      thread_ts: '111.222',
      broadcast: true,
      ephemeral_user: null,
    });
    const payload = JSON.parse(res);
    expect(payload).toEqual({ ok: true, channel: 'C1', ts: '111.222', thread_ts: '111.222', broadcast: true });
  });

  it('returns normalized error when Slack API responds with ok=false', async () => {
    postMessageMock.mockResolvedValue({ ok: false, error: 'channel_not_found' });
    const tool = await makeTool();
    const res = await tool.execute({
      channel: 'C1',
      text: 'hello',
      thread_ts: '111.222',
      broadcast: null,
      ephemeral_user: null,
    });
    const payload = JSON.parse(res);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('channel_not_found');
    expect(payload.details).toBeUndefined();
  });

  it('normalizes thrown errors into envelope with details', async () => {
    postMessageMock.mockRejectedValue(new Error('slack transport failed'));
    const tool = await makeTool();
    const res = await tool.execute({
      channel: 'C1',
      text: 'hello',
      thread_ts: '111.222',
      broadcast: null,
      ephemeral_user: null,
    });
    const payload = JSON.parse(res);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('slack transport failed');
    expect(payload.details).toMatchObject({ name: 'Error' });
    expect(typeof payload.details.stack).toBe('string');
  });

  it('handles undefined response defensively', async () => {
    postMessageMock.mockResolvedValue(undefined);
    const tool = await makeTool();
    const res = await tool.execute({
      channel: 'C1',
      text: 'hello',
      thread_ts: '111.222',
      broadcast: null,
      ephemeral_user: null,
    });
    const payload = JSON.parse(res);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('unknown_error');
  });
});
