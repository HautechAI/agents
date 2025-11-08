import { describe, it, expect } from 'vitest';
import { ChannelDescriptorSchema } from '../src/messaging/types';

describe('ChannelDescriptor validation', () => {
  it('validates slack descriptor', () => {
    const ok = ChannelDescriptorSchema.safeParse({ type: 'slack', identifiers: { channelId: 'C123', threadTs: '1717', ephemeralUser: null }, meta: {} });
    expect(ok.success).toBe(true);
  });
  it('validates github issue descriptor', () => {
    const ok = ChannelDescriptorSchema.safeParse({ type: 'github_issue', identifiers: { owner: 'octo', repo: 'repo', issueNumber: 1 }, meta: {} });
    expect(ok.success).toBe(true);
  });
  it('rejects unknown type', () => {
    const bad = ChannelDescriptorSchema.safeParse({ type: 'sms', identifiers: { to: '+100' }, meta: {} } as any);
    expect(bad.success).toBe(false);
  });
});

