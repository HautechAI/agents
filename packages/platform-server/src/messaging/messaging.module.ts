import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { VaultModule } from '../vault/vault.module';
import { MessagingService } from './messaging.service';
import { SlackAdapter } from './slack/slack.adapter';

@Module({
  imports: [CoreModule, VaultModule],
  providers: [SlackAdapter, MessagingService],
  exports: [MessagingService, SlackAdapter],
})
export class MessagingModule {}
