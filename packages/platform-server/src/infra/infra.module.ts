import { Module } from '@nestjs/common';
import { NixController } from './ncps/nix.controller';
import { ContainerService } from './container/container.service';
import { VaultModule } from './vault/vault.module';
import { ContainerCleanupService } from './container/containerCleanup.job';
import { ContainerRegistry } from './container/container.registry';
import { NcpsKeyService } from './ncps/ncpsKey.service';
import { GithubService } from './github/github.client';
import { PRService } from './github/pr.usecase';

@Module({
  imports: [VaultModule],
  providers: [ContainerService, ContainerCleanupService, NcpsKeyService, GithubService, PRService, ContainerRegistry],
  controllers: [NixController],
  exports: [VaultModule, ContainerService, ContainerCleanupService, NcpsKeyService, GithubService, PRService, ContainerRegistry],
})
export class InfraModule {}
