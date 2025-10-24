import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { PrismaService } from './services/prisma.service';
import { RuntimeService } from '../graph/runtime.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    PrismaService,
    RuntimeService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    PrismaService,
    RuntimeService,
  ],
})
export class CoreModule {}
