// Observability SDK initialization (replaces traceloop)
import { init as initTracing } from '@agyn/tracing';

initTracing({
  mode: 'extended',
  endpoints: { extended: process.env.TRACING_SERVER_URL || 'http://localhost:4319' },
  defaultAttributes: { service: 'server' },
});

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import cors from '@fastify/cors';

import { LoggerService } from './core/services/logger.service';
import { ContainerCleanupService } from './infra/container/containerCleanup.job';

import { initDI, closeDI } from './bootstrap/di';
import { AppModule } from './bootstrap/app.module';
// Remove central platform.services.factory usage; rely on DI providers

await initDI();

async function bootstrap() {
  // NestJS HTTP bootstrap using FastifyAdapter and resolve services via DI
  const adapter = new FastifyAdapter({ logger: false });
  await adapter.getInstance().register(cors, { origin: true });
  const app = await NestFactory.create(AppModule, adapter, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const logger = app.get(LoggerService, { strict: false });
  const fastify = adapter.getInstance();

  // Initialize checkpointer (optional Postgres mode)

  // Fastify instance is initialized via Nest adapter; routes are handled by Nest controllers only.

  // Start Fastify then attach Socket.io
  const PORT = Number(process.env.PORT) || 3010;
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  logger.info(`HTTP server listening on :${PORT}`);
  // RuntimeRef removed; runtime is available via DI

  // Routes registered above

  const shutdown = async () => {
    logger.info('Shutting down...');
    try {
      // Stop background cleanup before closing app
      // Resolve and stop cleanup service idempotently
      const cleanup = app.get(ContainerCleanupService, { strict: false });
      cleanup?.stop();
    } catch {}
    await mongo.close();
    try {
      await fastify.close();
    } catch {}
    try {
      await closeDI();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((e) => {
  console.error('Bootstrap failure', e);
  process.exit(1);
});

// Legacy Fastify helpers removed; Vault routes handled by Nest
