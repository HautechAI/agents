import { Prisma, PrismaClient } from '@prisma/client';

type BackfillResult = {
  assignedCount: number;
  totalThreads: number;
};

type BackfillOptions = {
  dryRun: boolean;
  batchSize: number;
};

type CallAgentMetadata = {
  childThreadId?: unknown;
};

const CALL_AGENT_TOOL_NAMES = ['call_agent', 'call_engineer'] as const;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMetadata(value: Prisma.JsonValue): CallAgentMetadata | null {
  if (!isRecord(value)) return null;
  return value as CallAgentMetadata;
}

async function buildCandidateAgentNodeSet(prisma: PrismaClient): Promise<Set<string>> {
  const known = new Set<string>();

  const assigned = await prisma.thread.findMany({
    where: { assignedAgentNodeId: { not: null } },
    select: { assignedAgentNodeId: true },
  });
  for (const row of assigned) {
    const nodeId = row.assignedAgentNodeId;
    if (typeof nodeId === 'string' && nodeId.trim().length > 0) {
      known.add(nodeId.trim());
    }
  }

  const toolEvents = await prisma.runEvent.findMany({
    where: {
      type: 'tool_execution',
      toolExecution: { toolName: { in: CALL_AGENT_TOOL_NAMES } },
      nodeId: { not: null },
    },
    select: { nodeId: true },
    distinct: ['nodeId'],
  });
  for (const event of toolEvents) {
    const nodeId = event.nodeId;
    if (typeof nodeId === 'string' && nodeId.trim().length > 0) {
      known.add(nodeId.trim());
    }
  }

  return known;
}

async function backfillAssignedAgents(prisma: PrismaClient, options: BackfillOptions): Promise<BackfillResult> {
  const candidates = await buildCandidateAgentNodeSet(prisma);

  const pendingThreads = await prisma.thread.findMany({
    where: { assignedAgentNodeId: null },
    select: { id: true },
  });

  if (pendingThreads.length === 0) {
    return { assignedCount: 0, totalThreads: 0 };
  }

  const allThreadIds = pendingThreads.map((row) => row.id);
  const assignments = new Map<string, string>();

  const conversationStates = await prisma.conversationState.findMany({
    where:
      candidates.size > 0
        ? {
            threadId: { in: allThreadIds },
            nodeId: { in: Array.from(candidates) },
          }
        : {
            threadId: { in: allThreadIds },
          },
    orderBy: { updatedAt: 'desc' },
  });

  for (const state of conversationStates) {
    const threadId = state.threadId;
    if (assignments.has(threadId)) continue;
    const nodeId = state.nodeId;
    if (typeof nodeId !== 'string') continue;
    const normalized = nodeId.trim();
    if (!normalized) continue;
    if (candidates.size > 0 && !candidates.has(normalized)) continue;
    assignments.set(threadId, normalized);
  }

  const unresolved = allThreadIds.filter((id) => !assignments.has(id));
  await assignFromCallAgentLinking(prisma, unresolved, candidates, assignments);

  if (assignments.size === 0) {
    return { assignedCount: 0, totalThreads: allThreadIds.length };
  }

  const updates = Array.from(assignments.entries());
  let applied = 0;
  const batchSize = Math.max(1, options.batchSize);

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    if (options.dryRun) {
      for (const [threadId, nodeId] of batch) {
        console.info(`[dry-run] Would assign thread ${threadId} -> agent node ${nodeId}`);
      }
      applied += batch.length;
      continue;
    }

    await prisma.$transaction(
      batch.map(([threadId, nodeId]) =>
        prisma.thread.update({ where: { id: threadId }, data: { assignedAgentNodeId: nodeId } }),
      ),
    );
    applied += batch.length;
  }

  return { assignedCount: applied, totalThreads: allThreadIds.length };
}

async function assignFromCallAgentLinking(
  prisma: PrismaClient,
  unresolved: string[],
  candidates: Set<string>,
  assignments: Map<string, string>,
): Promise<void> {
  if (unresolved.length === 0) return;

  const clauses = unresolved
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => ({ metadata: { path: ['childThreadId'], equals: id } }));

  if (clauses.length === 0) return;

  const linkEvents = await prisma.runEvent.findMany({
    where: {
      type: 'tool_execution',
      toolExecution: { toolName: { in: CALL_AGENT_TOOL_NAMES } },
      OR: clauses,
    },
    orderBy: { ts: 'desc' },
    select: { metadata: true, nodeId: true },
  });

  for (const event of linkEvents) {
    const nodeId = typeof event.nodeId === 'string' ? event.nodeId.trim() : '';
    if (!nodeId) continue;
    if (candidates.size > 0 && !candidates.has(nodeId)) continue;

    const metadata = parseMetadata(event.metadata);
    const threadId = metadata && typeof metadata.childThreadId === 'string' ? metadata.childThreadId : '';
    if (!threadId || assignments.has(threadId)) continue;

    assignments.set(threadId, nodeId);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.AGENTS_DATABASE_URL;
  if (!databaseUrl) {
    console.error('AGENTS_DATABASE_URL must be set');
    process.exitCode = 1;
    return;
  }

  const dryRun = parseBool(process.env.DRY_RUN, false) || process.argv.includes('--dry-run');
  const batchSize = parseNumber(process.env.BACKFILL_BATCH_SIZE, 25);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const { assignedCount, totalThreads } = await backfillAssignedAgents(prisma, { dryRun, batchSize });
    console.info(`Backfill complete. Threads evaluated: ${totalThreads}, assignments ${dryRun ? 'proposed' : 'applied'}: ${assignedCount}.`);
  } catch (error) {
    console.error('Backfill failed', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
