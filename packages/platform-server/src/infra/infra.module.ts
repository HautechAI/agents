import { Module } from '@nestjs/common';
import { NixController } from './ncps/nix.controller';
import { ContainerService } from './container/container.service';
import { VaultService } from './vault/vault.service';
import { ContainerCleanupService } from './container/containerCleanup.job';
import { ContainerRegistry } from './container/container.registry';
import { NcpsKeyService } from './ncps/ncpsKey.service';
import { GithubService } from './github/github.client';
import { PRService } from './github/pr.usecase';

@Module({
  providers: [ContainerService, VaultService, ContainerCleanupService, NcpsKeyService, GithubService, PRService, ContainerRegistry],
  controllers: [NixController],
  exports: [ContainerService, VaultService, ContainerCleanupService, NcpsKeyService, GithubService, PRService, ContainerRegistry],
})
export class InfraModule {}
