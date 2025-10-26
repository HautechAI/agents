import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';
import { Inject, Injectable } from '@nestjs/common';

// Define a minimal client interface used by our repositories.
// Avoid importing Prisma types so compilation succeeds even without prisma generate.
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
    }) => Promise<void>;
  };
}

@Injectable()
export class PrismaService {
  private prisma: unknown | null = null;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(ConfigService) private cfg: ConfigService,
  ) {}

  /**
   * Return a client instance implementing the minimal interface used by repositories,
   * or null when Prisma is unavailable. Instantiation is contained here to avoid
   * compile-time dependency on @prisma/client types.
   */
  getClient(): ConversationStateClient | null {
    try {
      if (!this.prisma) {
        const url = this.cfg.agentsDatabaseUrl;
        // Attempt to instantiate Prisma if available at runtime; otherwise, leave null.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        // Note: using require here avoids ESM dynamic import in code paths where Prisma is present.
        // If require fails, we catch and return null (persistence disabled).
        let PrismaClientCtor: unknown;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          PrismaClientCtor = require('@prisma/client').PrismaClient as unknown;
        } catch {
          this.logger.debug('PrismaClient unavailable; persistence disabled');
          return null;
        }
        if (typeof PrismaClientCtor !== 'function') {
          this.logger.debug('PrismaClient constructor not found; persistence disabled');
          return null;
        }
        // Instantiate client with configured datasource URL
        // Cast to unknown to avoid type dependency; repositories rely on structural typing.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.prisma = new (PrismaClientCtor as any)({ datasources: { db: { url } } });
      }
      return this.prisma as ConversationStateClient;
    } catch (e) {
      this.logger.error('Failed to initialize Prisma client: %s', (e as Error)?.message || String(e));
      return null;
    }
  }
}
