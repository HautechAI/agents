import { PrismaClient } from '@prisma/client';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';
import { Inject, Injectable } from '@nestjs/common';

// Minimal client surface used by ConversationStateRepository to avoid dependency
// on generated Prisma types during CI/builds. Structural typing only for methods used.
export type ConversationStateClient = {
  conversationState: {
    findUnique: (args: { where: { threadId_nodeId: { threadId: string; nodeId: string } } }) => Promise<{
      threadId: string;
      nodeId: string;
      state: unknown;
    } | null>;
    upsert: (args: {
      where: { threadId_nodeId: { threadId: string; nodeId: string } };
      create: { threadId: string; nodeId: string; state: unknown };
      update: { state: unknown };
    }) => Promise<unknown>;
  };
};

@Injectable()
export class PrismaService {
  private prisma: PrismaClient | null = null;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(ConfigService) private cfg: ConfigService,
  ) {}

  getClient(): PrismaClient | null {
    try {
      if (!this.prisma) {
        const url = this.cfg.agentsDatabaseUrl;
        this.prisma = new PrismaClient({ datasources: { db: { url } } });
      }
      return this.prisma;
    } catch (e) {
      this.logger.error('Failed to initialize Prisma client: %s', (e as Error)?.message || String(e));
      throw e;
    }
  }
}
