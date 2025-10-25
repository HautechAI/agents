import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module.js';
import { ConfigService } from '../core/services/config.service.js';
import { LoggerService } from '../core/services/logger.service.js';
import { MongoService } from '../core/services/mongo.service.js';
import { ContainerRegistry } from './container/container.registry.js';
import { ContainerService } from './container/container.service.js';
import { ContainerCleanupService } from './container/containerCleanup.job.js';
import { GithubService } from './github/github.client.js';
import { PRService } from './github/pr.usecase.js';
import { NcpsKeyService } from './ncps/ncpsKey.service.js';
import { NixController } from './ncps/nix.controller.js';
import { VaultModule } from './vault/vault.module.js';

@Module({
  imports: [CoreModule, VaultModule],
  providers: [
    {
      provide: ContainerRegistry,
      useFactory: async (mongo: MongoService, logger: LoggerService, containers: ContainerService) => {
        const svc = new ContainerRegistry(mongo.getDb(), logger);
        await svc.ensureIndexes();
        await svc.backfillFromDocker(containers);

        return svc;
      },
      inject: [MongoService, LoggerService, ContainerService],
    },
    {
      provide: ContainerCleanupService,
      useFactory: (registry: ContainerRegistry, containers: ContainerService, logger: LoggerService) => {
        const svc = new ContainerCleanupService(registry, containers, logger);
        svc.start();

        return svc;
      },
      inject: [ContainerRegistry, ContainerService, LoggerService],
    },
    ContainerService,
    {
      provide: NcpsKeyService,
      useFactory: async (config: ConfigService, logger: LoggerService) => {
        const svc = new NcpsKeyService(config, logger);
        await svc.init();

        return svc;
      },
      inject: [ConfigService, LoggerService],
    },
    {
      provide: GithubService,
      useFactory: (config: ConfigService, logger: LoggerService) => new GithubService(config, logger),
      inject: [ConfigService, LoggerService],
    },
    PRService,
  ],
  controllers: [NixController],
  exports: [
    VaultModule,
    ContainerService,
    ContainerCleanupService,
    NcpsKeyService,
    {
      provide: GithubService,
      useFactory: (config: ConfigService, logger: LoggerService) => new GithubService(config, logger),
      inject: [ConfigService, LoggerService],
    },
    PRService,
    ContainerRegistry,
  ],
})
export class InfraModule {}
