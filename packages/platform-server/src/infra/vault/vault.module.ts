import { Module } from '@nestjs/common';
import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';
import { VaultEnabledGuard } from './vault-enabled.guard';

@Module({
  providers: [VaultService, VaultEnabledGuard],
  controllers: [VaultController],
  exports: [VaultService],
})
export class VaultModule {}
