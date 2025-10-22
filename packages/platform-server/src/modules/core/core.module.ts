import { Module } from '@nestjs/common';
import { ConfigService } from '../../src/services/config.service.js';
import { LoggerService } from '../../src/services/logger.service.js';
import { MongoService } from '../../src/services/mongo.service.js';
import { ContainerService } from '../../src/services/container.service.js';
import { VaultService, VaultConfigSchema } from '../../src/services/vault.service.js';
import { NcpsKeyService } from '../../src/services/ncpsKey.service.js';
import { LLMFactoryService } from '../../src/services/llmFactory.service.js';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    { provide: MongoService, useFactory: (cfg: ConfigService, log: LoggerService) => new MongoService(cfg, log), inject: [ConfigService, LoggerService] },
    { provide: ContainerService, useFactory: (log: LoggerService) => new ContainerService(log), inject: [LoggerService] },
    { provide: VaultService, useFactory: (cfg: ConfigService, log: LoggerService) => new VaultService(VaultConfigSchema.parse({ enabled: cfg.vaultEnabled, addr: cfg.vaultAddr, token: cfg.vaultToken, defaultMounts: ['secret'] }), log), inject: [ConfigService, LoggerService] },
    { provide: NcpsKeyService, useFactory: (cfg: ConfigService, log: LoggerService) => new NcpsKeyService(cfg, log), inject: [ConfigService, LoggerService] },
    { provide: LLMFactoryService, useFactory: (cfg: ConfigService) => new LLMFactoryService(cfg), inject: [ConfigService] },
  ],
  exports: [ConfigService, LoggerService, MongoService, ContainerService, VaultService, NcpsKeyService, LLMFactoryService],
})
export class CoreModule {}

