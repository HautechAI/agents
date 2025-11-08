import { describe, it, expect } from 'vitest';
import { ChannelAdapterRegistry } from '../src/messaging/registry';
import { ChannelDescriptor } from '../src/messaging/types';

describe('ChannelAdapterRegistry', () => {
  const deps = { logger: { info: () => {}, error: () => {} }, vault: { getSecret: async () => null }, config: { slack: { botToken: 'xoxb-abc' } } };
  it('returns Slack adapter for slack type', () => {
    const desc: ChannelDescriptor = { type: 'slack', identifiers: { channelId: 'C1' }, meta: {} } as any;
    const adapter = ChannelAdapterRegistry.getAdapter(desc, deps as any);
    expect(adapter).toBeTruthy();
    expect(typeof (adapter as any).sendText).toBe('function');
  });
  it('throws for unknown/unsupported type', () => {
    const desc: ChannelDescriptor = { type: 'discord', identifiers: { channelId: 'abc' }, meta: {} } as any;
    expect(() => ChannelAdapterRegistry.getAdapter(desc, deps as any)).toThrow();
  });
});

