import { Module } from '@nestjs/common';
import { CoreModule } from "../../core/core.module.js";
import { ConfigService } from "../../core/services/config.service.js";
import { LoggerService } from "../../core/services/logger.service.js";

import { VaultService } from './vault.service.js';
import { VaultController } from './vault.controller.js';
import { VaultEnabledGuard } from './vault-enabled.guard.js';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: VaultService,
      useFactory: (config: ConfigService, logger: LoggerService) => new VaultService(config, logger),
      inject: [ConfigService, LoggerService],
    },
    VaultEnabledGuard,
  ],
  controllers: [VaultController],
  exports: [VaultService],
})
export class VaultModule {}
