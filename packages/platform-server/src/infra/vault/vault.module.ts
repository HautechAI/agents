import { Module } from '@nestjs/common';
import { CoreModule } from "../../core/core.module";

import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';
import { VaultEnabledGuard } from './vault-enabled.guard';

@Module({
  imports: [CoreModule],
  providers: [VaultService, VaultEnabledGuard],
  controllers: [VaultController],
  exports: [VaultService],
})
export class VaultModule {}
