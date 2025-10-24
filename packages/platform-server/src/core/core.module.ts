import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { LLMFactoryService } from '../llm/llmFactory.service';
import { EnvService } from './env.resolver';
import { PrismaService } from './services/prisma.service';
import { RuntimeService } from '../graph/runtime.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    LLMFactoryService,
    EnvService,
    PrismaService,
    RuntimeService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    LLMFactoryService,
    EnvService,
    PrismaService,
    RuntimeService,
  ],
})
export class CoreModule {}
