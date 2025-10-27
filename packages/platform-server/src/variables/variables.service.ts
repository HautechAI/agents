import { Inject, Injectable } from '@nestjs/common';
import type { GraphRepository } from '../graph/graph.repository';
import type { VariableGraphItem, VariableViewItem } from './variables.types';
import { PrismaService } from '../core/services/prisma.service';

@Injectable()
export class VariablesService {
  constructor(
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  // init(): reserved for future non-DI params

  async getVariables(name: string): Promise<VariableViewItem[]> {
    const g = await this.graphs.get(name);
    const items: VariableGraphItem[] = g?.variables?.items ?? [];
    // merge local values from DB for source=local
    const prisma = this.prismaService.getClient();
    const out: VariableViewItem[] = [];
    if (!prisma) {
      // persistence disabled -> return graph/vault items; local without value
      for (const it of items) out.push({ key: it.key, source: it.source, value: it.value, vaultRef: it.vaultRef });
      return out;
    }
    const locals = await prisma.variable.findMany({ where: { graphName: name } });
    const localMap = new Map(locals.map((v) => [v.key, v.value] as const));
    for (const it of items) {
      if (it.source === 'local') {
        const val = localMap.get(it.key);
        out.push({ key: it.key, source: 'local', value: val ?? '' });
      } else {
        out.push({ key: it.key, source: it.source, value: it.value ?? '', vaultRef: it.vaultRef ?? '' });
      }
    }
    return out;
  }

  async createVariable(name: string, item: VariableGraphItem, expectedVersion?: number): Promise<void> {
    const current = (await this.graphs.get(name)) ?? { name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [] };
    const items = Array.from(current.variables?.items ?? []);
    if (items.find((v) => v.key === item.key)) {
      const e = new Error(`Duplicate key ${item.key}`) as Error & { code: string };
      (e as any).code = 'DUPLICATE_KEY';
      throw e;
    }
    const normalized: VariableGraphItem = normalizeItem(item);
    items.push(normalized);
    await this.graphs.upsertVariables(name, items, expectedVersion ?? current.version);
    const prisma = this.prismaService.getClient();
    if (normalized.source === 'local' && prisma) {
      await prisma.variable.upsert({
        where: { graphName_key: { graphName: name, key: normalized.key } },
        create: { graphName: name, key: normalized.key, value: normalized.value ?? '' },
        update: { value: normalized.value ?? '' },
      });
    }
  }

  async updateVariable(name: string, key: string, next: VariableGraphItem, expectedVersion?: number): Promise<void> {
    const current = await this.graphs.get(name);
    if (!current) throw new Error('Graph not found');
    const items = Array.from(current.variables?.items ?? []);
    const idx = items.findIndex((v) => v.key === key);
    if (idx < 0) throw new Error('Variable not found');
    const prev = items[idx];
    const prisma = this.prismaService.getClient();
    const nextNorm = normalizeItem({ ...next, key });
    // handle transitions
    if (prev.source === 'local' && nextNorm.source !== 'local') {
      // delete prisma row
      if (prisma) {
        await prisma.variable.delete({ where: { graphName_key: { graphName: name, key } } }).catch(() => {});
      }
    }
    if (prev.source !== 'local' && nextNorm.source === 'local') {
      // create/update prisma row with value
      if (prisma) {
        await prisma.variable.upsert({
          where: { graphName_key: { graphName: name, key } },
          create: { graphName: name, key, value: nextNorm.value ?? '' },
          update: { value: nextNorm.value ?? '' },
        });
      }
      // in graph, local should not store value/vaultRef beyond optional normalization
    }
    // graph <-> vault transitions: clear other field
    if (nextNorm.source === 'graph') nextNorm.vaultRef = '';
    if (nextNorm.source === 'vault') nextNorm.value = '';
    items[idx] = nextNorm;
    await this.graphs.upsertVariables(name, items, expectedVersion ?? current.version);
  }

  async deleteVariable(name: string, key: string, expectedVersion?: number): Promise<void> {
    const current = await this.graphs.get(name);
    if (!current) throw new Error('Graph not found');
    const items = Array.from(current.variables?.items ?? []);
    const idx = items.findIndex((v) => v.key === key);
    if (idx < 0) return; // idempotent
    const prev = items[idx];
    items.splice(idx, 1);
    await this.graphs.upsertVariables(name, items, expectedVersion ?? current.version);
    if (prev.source === 'local') {
      const prisma = this.prismaService.getClient();
      if (prisma) {
        await prisma.variable.delete({ where: { graphName_key: { graphName: name, key } } }).catch(() => {});
      }
    }
  }
}

function normalizeItem(item: VariableGraphItem): VariableGraphItem {
  const base: VariableGraphItem = { key: item.key, source: item.source };
  if (item.source === 'graph') {
    base.value = item.value ?? '';
    base.vaultRef = '';
  } else if (item.source === 'vault') {
    base.vaultRef = item.vaultRef ?? '';
    base.value = '';
  } else {
    // local
    base.value = item.value ?? '';
    base.vaultRef = '';
  }
  return base;
}
