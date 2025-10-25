import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service.js';
import { LoggerService } from './services/logger.service.js';
import { MongoService } from './services/mongo.service.js';
import { PrismaService } from './services/prisma.service.js';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    {
      provide: MongoService,
      useFactory: (configService: ConfigService, logger: LoggerService) => {
        // Construct service only; avoid connecting at provider time.
        const mongo = new MongoService(configService, logger);
        await mongo.connect();
        return mongo;
      },
      inject: [ConfigService, LoggerService],
    },
    PrismaService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    PrismaService,
  ],
})
export class CoreModule {}
