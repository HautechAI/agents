import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';
import { Inject, Injectable } from '@nestjs/common';

// Minimal client surface used by ConversationStateRepository to avoid dependency
// on generated Prisma types during CI/builds. Structural typing only for methods used.
export interface ConversationStateClient {
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
}

@Injectable()
export class PrismaService {
  private prisma: ConversationStateClient | null = null;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(ConfigService) private cfg: ConfigService,
  ) {}

  getClient(): ConversationStateClient | null {
    try {
      if (!this.prisma) {
        const url = this.cfg.agentsDatabaseUrl;
        // Construct runtime client without compile-time Prisma types
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod: any = require('@prisma/client');
        const PrismaCtor = mod?.PrismaClient;
        if (!PrismaCtor) throw new Error('PrismaClient not available');
        this.prisma = new PrismaCtor({ datasources: { db: { url } } }) as ConversationStateClient;
      }
      return this.prisma;
    } catch (e) {
      this.logger.error('Failed to initialize Prisma client: %s', (e as Error)?.message || String(e));
      throw e;
    }
  }
}
