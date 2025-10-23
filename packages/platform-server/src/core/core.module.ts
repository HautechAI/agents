import { Module } from '@nestjs/common';
import { ConfigService } from './core/services/config.service.js';
import { LoggerService } from './core/services/logger.service.js';
import { MongoService } from './core/services/mongo.service.js';
import { ContainerService } from './core/services/container.service.js';
import { VaultService } from './core/services/vault.service.js';
import { NcpsKeyService } from './core/services/ncpsKey.service.js';
import { LLMFactoryService } from './core/services/llmFactory.service.js';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    ContainerService,
    VaultService,
    NcpsKeyService,
    LLMFactoryService,
  ],
  exports: [ConfigService, LoggerService, MongoService, ContainerService, VaultService, NcpsKeyService, LLMFactoryService],
})
export class CoreModule {}
