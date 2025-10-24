import pkgPrisma from '@prisma/client';
const { PrismaClient } = pkgPrisma as unknown as { PrismaClient: new (...args: unknown[]) => unknown };
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';

export class PrismaService {
  private prisma: PrismaClient | null = null;

  constructor(
    private logger: LoggerService,
    private cfg: ConfigService,
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
