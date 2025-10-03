import { z } from 'zod';
import { BaseTrigger } from './base.trigger';
import { LoggerService } from '../services/logger.service';
import { DynamicStructuredTool } from '@langchain/core/tools';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

export const DebugToolTriggerStaticConfigSchema = z
  .object({
    path: z.string().default('/debug/tool'),
    method: z.enum(['POST']).default('POST'),
    authToken: z.string().optional(),
  })
  .strict();

export class DebugToolTrigger extends BaseTrigger {
  private server: FastifyInstance | null = null;
  private tool: DynamicStructuredTool | null = null;
  private cfg: z.infer<typeof DebugToolTriggerStaticConfigSchema> = { path: '/debug/tool', method: 'POST' } as any;

  constructor(private logger: LoggerService) { super(); }

  setTool(tool: DynamicStructuredTool | undefined) {
    this.tool = tool || null;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = DebugToolTriggerStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) throw new Error('Invalid DebugToolTrigger config');
    this.cfg = parsed.data;
    // If running, rebind route
    if (this.server) await this.rebindRoute();
  }

  protected async doProvision(): Promise<void> {
    if (this.server) return;
    const srv = Fastify({ logger: false });
    await srv.register(cors, { origin: true });
    this.server = srv;
    await this.rebindRoute();
    const port = await this.listenOnEphemeral();
    this.logger.info(`[DebugToolTrigger] HTTP listening on :${port} ${this.cfg.method} ${this.cfg.path}`);
  }
  protected async doDeprovision(): Promise<void> {
    if (!this.server) return;
    try { await this.server.close(); } catch {}
    this.server = null;
  }

  private async listenOnEphemeral(): Promise<number> {
    if (!this.server) throw new Error('server not initialized');
    const port = 0; // ephemeral
    await this.server.listen({ port, host: '127.0.0.1' });
    const addr = this.server.server.address();
    if (typeof addr === 'object' && addr && 'port' in addr) return addr.port as number;
    return 0;
  }

  private async rebindRoute(): Promise<void> {
    if (!this.server) return;
    // Remove all routes and re-register minimal ones
    this.server.removeAllListeners('request');
    const path = this.normalizePath(this.cfg.path);
    this.server.post(path, async (request, reply) => {
      try {
        if (this.cfg.authToken) {
          const token = request.headers['x-debug-token'];
          if (token !== this.cfg.authToken) {
            reply.code(401);
            return { error: 'unauthorized' };
          }
        }
        if (!this.tool) {
          reply.code(400);
          return { error: 'tool_not_connected' };
        }
        const body = request.body as any;
        const input = body?.input;
        if (input === undefined) {
          reply.code(400);
          return { error: 'invalid_body', message: 'expected { input: <args> }' };
        }
        const result = await this.tool.invoke(input, { configurable: { thread_id: 'debug' } } as any);
        return { ok: true, result };
      } catch (err: any) {
        this.logger.error('[DebugToolTrigger] request error', err?.message || err);
        reply.code(500);
        return { error: 'internal_error', message: err?.message || String(err) };
      }
    });
  }

  private normalizePath(p: string): string {
    if (!p.startsWith('/')) return '/' + p;
    return p;
  }
}
