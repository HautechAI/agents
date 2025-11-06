import { Inject, Injectable, Scope } from '@nestjs/common';
import { LoggerService } from '../core/services/logger.service';
import type { ChannelInfo, SlackChannelInfo } from './types';
import { SlackChannelAdapter, type SendResult } from './slack.adapter';
import { VaultService } from '../vault/vault.service';
import { normalizeTokenRef, parseVaultRef, resolveTokenRef } from '../utils/refs';

export type MessengerType = 'slack';

export interface Messenger {
  send(info: ChannelInfo, params: { text: string; broadcast?: boolean; ephemeral_user?: string | null }): Promise<SendResult>;
}

@Injectable({ scope: Scope.TRANSIENT })
export class TriggerMessagingService {
  private registry = new Map<string, Messenger>();
  constructor(@Inject(LoggerService) private readonly logger: LoggerService) {}

  private key(type: MessengerType, triggerNodeId: string): string {
    return `${type}:${triggerNodeId}`;
  }

  register(type: MessengerType, triggerNodeId: string, messenger: Messenger): void {
    this.registry.set(this.key(type, triggerNodeId), messenger);
  }
  unregister(type: MessengerType, triggerNodeId: string): void {
    this.registry.delete(this.key(type, triggerNodeId));
  }
  resolve(type: MessengerType, triggerNodeId: string): Messenger | undefined {
    return this.registry.get(this.key(type, triggerNodeId));
  }
}

// Slack trigger-bound messenger factory
export function createSlackMessenger(
  deps: { logger: LoggerService; vault: VaultService },
  config: { bot_token?: { value: string; source?: 'static' | 'vault' } },
): Messenger {
  const adapter = new SlackChannelAdapter(deps.logger);
  return {
    async send(info: ChannelInfo, params: { text: string; broadcast?: boolean; ephemeral_user?: string | null }) {
      const slack = info as SlackChannelInfo;
      // Resolve token strictly from trigger config
      const bot = (config.bot_token
        ? normalizeTokenRef(config.bot_token)
        : ({ value: '', source: 'static' } as { value: string; source: 'static' })) as {
        value: string;
        source: 'static' | 'vault';
      };
      if (bot.source === 'vault') parseVaultRef(bot.value);
      if (!config.bot_token) return { ok: false, error: 'bot_token_missing', attempts: 0 } as SendResult;
      const token = await resolveTokenRef(bot, { expectedPrefix: 'xoxb-', fieldName: 'bot_token', vault: deps.vault });
      return adapter.send(slack, { text: params.text, broadcast: params.broadcast, ephemeral_user: params.ephemeral_user }, token);
    },
  };
}

