import type { ChannelAdapter, ChannelAdapterDeps } from './types';
import type { ChannelDescriptor } from './types';
import { SlackAdapter } from './slack/slack.adapter';

export class ChannelAdapterRegistry {
  static getAdapter(descriptor: ChannelDescriptor, deps: ChannelAdapterDeps): ChannelAdapter {
    switch (descriptor.type) {
      case 'slack':
        return new SlackAdapter(deps);
      case 'github_issue':
      case 'email':
      case 'internal_chat':
      case 'discord':
        throw new Error(`Adapter for type '${descriptor.type}' not implemented`);
      default:
        // Exhaustiveness guard
        throw new Error(`Unknown channel type: ${(descriptor as { type?: unknown })?.type}`);
    }
  }
}

