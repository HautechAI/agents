import { PrismaClient } from '@prisma/client';
import type { LoopState } from '../llloop/types.js';

// SnapshotStore persists/retrieves full LoopState snapshots per nodeId+threadId
export class SnapshotStore {
  constructor(private prisma: PrismaClient) {}

  async getSnapshot(nodeId: string, threadId: string): Promise<LoopState | null> {
    const snap = await this.prisma.conversationSnapshot.findUnique({
      where: { nodeId_conversationId: { nodeId, conversationId: threadId } },
    });
    if (!snap) return null;
    // stateJson is stored as Json (JSONB); we expect it to conform to LoopState
    return snap.stateJson as unknown as LoopState;
  }

  async upsertSnapshot(nodeId: string, threadId: string, state: LoopState): Promise<void> {
    await this.prisma.conversationSnapshot.upsert({
      where: { nodeId_conversationId: { nodeId, conversationId: threadId } },
      create: {
        nodeId,
        conversationId: threadId,
        stateJson: state as unknown as Record<string, unknown>,
        summaryText: state.summary,
      },
      update: {
        stateJson: state as unknown as Record<string, unknown>,
        summaryText: state.summary,
        version: { increment: 1 },
      },
    });
  }
}

