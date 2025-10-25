import { Controller, Get, Post, Headers, Body, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { LoggerService } from '../../core/services/logger.service';
import { TemplateRegistry } from '../templateRegistry';
import { LiveGraphRuntime } from '../liveGraph.manager';
import { GraphRepository, type GraphAuthor } from '../graph.repository';
import {
  GraphError,
  type GraphDefinition,
  type PersistedGraphUpsertRequest,
  type PersistedGraphUpsertResponse,
} from '../types';
import { z } from 'zod';
import { GraphErrorCode } from '../errors';
import { enforceMcpCommandMutationGuard } from '../graph.guard';

// Helper to convert persisted graph to runtime GraphDefinition (mirrors src/index.ts)
const toRuntimeGraph = (saved: { nodes: any[]; edges: any[] }): GraphDefinition => {
  return {
    nodes: saved.nodes.map((n) => ({
      id: n.id,
      data: { template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, state: n.state },
    })),
    edges: saved.edges.map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
    })),
  } as GraphDefinition;
};

@Controller('api')
export class GraphPersistController {
  constructor(
    private readonly logger: LoggerService,
    private readonly templates: TemplateRegistry,
    private readonly runtime: LiveGraphRuntime,
    private readonly graphs: GraphRepository,
  ) {}

  @Get('graph')
  async getGraph(): Promise<{ name: string; version: number; updatedAt: string; nodes: any[]; edges: any[] }> {
    const name = 'main';
    const graph = await this.graphs.get(name);
    if (!graph) {
      return { name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [] };
    }
    return graph;
  }

  @Post('graph')
  @HttpCode(200)
  async upsertGraph(
    @Body() body: PersistedGraphUpsertRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<PersistedGraphUpsertResponse | { error: string; current?: unknown }> {
    try {
      const parsedResult = GraphPersistController.UpsertSchema.safeParse(body);
      if (!parsedResult.success) {
        throw new HttpException({ error: 'BAD_SCHEMA', current: parsedResult.error.format() }, HttpStatus.BAD_REQUEST);
      }
      const parsed = parsedResult.data as PersistedGraphUpsertRequest;
      parsed.name = parsed.name || 'main';
      // Resolve author from headers (support legacy keys)
      const author: GraphAuthor = {
        name: (headers['x-graph-author-name'] || headers['x-author-name']) as string | undefined,
        email: (headers['x-graph-author-email'] || headers['x-author-email']) as string | undefined,
      };
      // Capture previous graph (for change detection / events)
      const before = await this.graphs.get(parsed.name);

      // Guard against unsafe MCP command mutation
      try {
        enforceMcpCommandMutationGuard(before, parsed, this.runtime);
      } catch (e: unknown) {
        if (e instanceof GraphError && e?.code === GraphErrorCode.McpCommandMutationForbidden) {
          // 409 with error code body
          const err = { error: GraphErrorCode.McpCommandMutationForbidden } as const;
          throw new HttpException(err, HttpStatus.CONFLICT);
        }
        throw e;
      }

      const saved = await this.graphs.upsert(parsed, author);
      try {
        await this.runtime.apply(toRuntimeGraph(saved));
      } catch {
        this.logger.debug('Failed to apply updated graph to runtime; rolling back persistence');
      }

      // Emit node_config events for any node whose static or dynamic config changed
      if (before) {
        const beforeStatic = new Map(before.nodes.map((n) => [n.id, JSON.stringify(n.config || {})]));
        const beforeDynamic = new Map(before.nodes.map((n) => [n.id, JSON.stringify(n.dynamicConfig || {})]));
        for (const n of saved.nodes) {
          const prevS = beforeStatic.get(n.id);
          const prevD = beforeDynamic.get(n.id);
          const currS = JSON.stringify(n.config || {});
          const currD = JSON.stringify(n.dynamicConfig || {});
          if (prevS !== currS || prevD !== currD) {
            // Socket.io Gateway not wired in Nest yet; log and TODO
            this.logger.info('node_config changed for %s (v=%s) [TODO: emit via gateway]', n.id, String(saved.version));
          }
        }
      }
      return saved;
    } catch (e: any) {
      // Map known repository errors to status codes and bodies
      if (e?.code === 'VERSION_CONFLICT') {
        throw new HttpException({ error: 'VERSION_CONFLICT', current: e.current }, HttpStatus.CONFLICT);
      }
      if (e?.code === 'LOCK_TIMEOUT') {
        throw new HttpException({ error: 'LOCK_TIMEOUT' }, HttpStatus.CONFLICT);
      }
      if (e?.code === 'COMMIT_FAILED') {
        throw new HttpException({ error: 'COMMIT_FAILED' }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      throw new HttpException({ error: e?.message || 'Bad Request' }, HttpStatus.BAD_REQUEST);
    }
  }
}
  // Zod schema for upsert body
  private static readonly UpsertSchema = z
    .object({
      name: z.string().min(1),
      version: z.number().int().nonnegative().optional(),
      nodes: z
        .array(
          z.object({
            id: z.string().min(1),
            template: z.string().min(1),
            config: z.record(z.any()).optional(),
            dynamicConfig: z.record(z.any()).optional(),
            state: z.record(z.any()).optional(),
            position: z.object({ x: z.number(), y: z.number() }).optional(),
          }),
        )
        .max(1000),
      edges: z
        .array(
          z.object({
            id: z.string().optional(),
            source: z.string().min(1),
            sourceHandle: z.string().min(1),
            target: z.string().min(1),
            targetHandle: z.string().min(1),
          }),
        )
        .max(2000),
    })
    .strict();
