import { randomUUID } from 'node:crypto';
import type { ContainerRegistryService } from './containerRegistry.service';
import type { ContainerService } from './container.service';
import { LoggerService } from './logger.service';

export class ContainerCleanupService {
  private timer?: NodeJS.Timeout;
  private enabled: boolean;

  constructor(
    private registry: ContainerRegistryService,
    private containers: ContainerService,
    private logger: LoggerService,
  ) {
    const env = process.env.CONTAINERS_CLEANUP_ENABLED;
    this.enabled = env == null ? true : String(env).toLowerCase() === 'true';
  }

  start(intervalMs = 5 * 60 * 1000): void {
    if (!this.enabled) {
      this.logger.info('ContainerCleanup: disabled by CONTAINERS_CLEANUP_ENABLED');
      return;
    }
    const run = async () => {
      try {
        await this.sweep();
      } catch (e) {
        this.logger.error('ContainerCleanup: sweep error', e);
      } finally {
        this.timer = setTimeout(run, intervalMs);
      }
    };
    // initial sweep soon after start
    this.timer = setTimeout(run, 5_000);
    this.logger.info('ContainerCleanup: started background sweeper');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async sweep(now: Date = new Date()): Promise<void> {
    const expired = await this.registry.getExpired(now);
    if (!expired.length) return;
    this.logger.info(`ContainerCleanup: found ${expired.length} expired containers`);
    for (const doc of expired) {
      const claimId = randomUUID();
      const ok = await this.registry.claimForTermination(doc.container_id, claimId);
      if (!ok) continue; // claimed by another worker
      try {
        // Try graceful stop then remove
        try {
          await this.containers.stopContainer(doc.container_id, 10);
        } catch (e: any) {
          if (e?.statusCode !== 304 && e?.statusCode !== 404) throw e;
        }
        try {
          await this.containers.removeContainer(doc.container_id, true);
        } catch (e: any) {
          if (e?.statusCode !== 404) throw e;
        }
        await this.registry.markStopped(doc.container_id, 'ttl_expired');
      } catch (e) {
        this.logger.error('ContainerCleanup: error stopping/removing', { id: doc.container_id, error: e });
        // On error, leave status=terminating; next sweep will retry
      }
    }
  }
}

