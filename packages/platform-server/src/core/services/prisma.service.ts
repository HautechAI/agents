import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';

export class PrismaService {
  // Type imported for compile-time only; runtime loaded lazily
  private prisma: import('@prisma/client').PrismaClient | null = null;

  constructor(
    private logger: LoggerService,
    private cfg: ConfigService,
  ) {}

  async getClient(): Promise<import('@prisma/client').PrismaClient | null> {
    try {
      if (!this.prisma) {
        const url = this.cfg.agentsDatabaseUrl;
        const mod = await import('@prisma/client');
        const PrismaClient = (mod as { PrismaClient: new (...args: any[]) => import('@prisma/client').PrismaClient }).PrismaClient;
        this.prisma = new PrismaClient({ datasources: { db: { url } } });
      }
      return this.prisma;
    } catch (e) {
      this.logger.error('Failed to initialize Prisma client: %s', (e as Error)?.message || String(e));
      throw e;
    }
  }
}
