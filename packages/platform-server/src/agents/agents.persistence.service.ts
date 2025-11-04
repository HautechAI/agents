import { Injectable, Inject } from '@nestjs/common';
import { Prisma, PrismaClient, MessageKind, RunStatus, RunMessageType } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';

export type RunStartResult = { runId: string };

@Injectable()
export class AgentsPersistenceService {
  constructor(@Inject(PrismaService) private prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async ensureThreadByAlias(alias: string): Promise<string> {
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    if (existing) return existing.id;
    const created = await this.prisma.thread.create({ data: { alias } });
    return created.id;
  }

  async beginRun(threadAlias: string, inputMessages: Prisma.InputJsonValue[]): Promise<RunStartResult> {
    const threadId = await this.ensureThreadByAlias(threadAlias);
    const { runId } = await this.prisma.$transaction(async (tx) => {
      const run = await tx.run.create({ data: { threadId, status: RunStatus.running } });
      await Promise.all(
        inputMessages.map(async (msg) => {
          const { kind, text } = this.extractKindText(msg);
          const created = await tx.message.create({ data: { kind, text, source: msg } });
          await tx.runMessage.create({ data: { runId: run.id, messageId: created.id, type: RunMessageType.input } });
        }),
      );
      return { runId: run.id };
    });
    return { runId };
  }

  async recordInjected(runId: string, injectedMessages: Prisma.InputJsonValue[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        injectedMessages.map(async (msg) => {
          const { kind, text } = this.extractKindText(msg);
          const created = await tx.message.create({ data: { kind, text, source: msg } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: RunMessageType.injected } });
        }),
      );
    });
  }

  async completeRun(runId: string, status: RunStatus, outputMessages: Prisma.InputJsonValue[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        outputMessages.map(async (msg) => {
          const { kind, text } = this.extractKindText(msg);
          const created = await tx.message.create({ data: { kind, text, source: msg } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: RunMessageType.output } });
        }),
      );
      await tx.run.update({ where: { id: runId }, data: { status } });
    });
  }

  async listThreads(): Promise<Array<{ id: string; alias: string; createdAt: Date }>> {
    return this.prisma.thread.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, alias: true, createdAt: true }, take: 100 });
  }

  async listRuns(
    threadId: string,
    take: number = 100,
  ): Promise<Array<{ id: string; status: RunStatus; createdAt: Date; updatedAt: Date }>> {
    return this.prisma.run.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true, updatedAt: true },
      take,
    });
  }

  async listRunMessages(runId: string, type: RunMessageType): Promise<Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }>> {
    const links = await this.prisma.runMessage.findMany({ where: { runId, type }, select: { messageId: true } });
    if (links.length === 0) return [];
    const msgIds = links.map((l) => l.messageId);
    const msgs = await this.prisma.message.findMany({ where: { id: { in: msgIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, text: true, source: true, createdAt: true } });
    return msgs;
  }

  private extractKindText(msg: Prisma.InputJsonValue): { kind: MessageKind; text: string | null } {
    const obj = typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : {};
    const type = typeof obj.type === 'string' ? (obj.type as string) : undefined;
    const role = typeof obj.role === 'string' ? (obj.role as string) : undefined;

    // Defaults
    let kind: MessageKind = MessageKind.user;
    let text: string | null = null;

    // Handle function call variants explicitly
    if (type === 'function_call') {
      kind = MessageKind.tool;
      const name = typeof obj.name === 'string' ? (obj.name as string) : 'unknown';
      const args = typeof (obj as any).arguments === 'string' ? ((obj as any).arguments as string) : '';
      text = `call ${name}(${args})`;
      return { kind, text };
    }
    if (type === 'function_call_output') {
      kind = MessageKind.tool;
      const output = (obj as any).output as unknown;
      if (typeof output === 'string') text = output;
      else if (typeof output !== 'undefined') text = JSON.stringify(output);
      else text = null;
      return { kind, text };
    }

    // Message items
    if (type === 'message') {
      if (role === 'assistant') kind = MessageKind.assistant;
      else if (role === 'system') kind = MessageKind.system;
      else if (role === 'tool') kind = MessageKind.tool;
      else kind = MessageKind.user;

      // Immediate fallback: top-level text wins
      if (typeof (obj as any).text === 'string') {
        text = (obj as any).text as string;
      }

      // Role-specific extraction
      const content = Array.isArray((obj as any).content) ? ((obj as any).content as any[]) : [];
      if (!text && role === 'assistant') {
        const parts = content
          .filter((c) => c && typeof c === 'object' && c.type === 'output_text' && typeof c.text === 'string')
          .map((c) => c.text as string);
        if (parts.length) text = parts.join('\n');
      } else if (!text && (role === 'user' || role === 'system')) {
        const parts = content
          .filter((c) => c && typeof c === 'object' && c.type === 'input_text' && typeof c.text === 'string')
          .map((c) => c.text as string);
        if (parts.length) text = parts.join('\n');
      }
    } else {
      // Kind inference from role for non-message types (fallback)
      if (role === 'assistant') kind = MessageKind.assistant;
      else if (role === 'system') kind = MessageKind.system;
      else if (role === 'tool') kind = MessageKind.tool;
    }

    // Fallbacks when still empty
    if (text === null || text === undefined || text === '') {
      if (typeof (obj as any).text === 'string') {
        text = (obj as any).text as string;
      } else if (Array.isArray((obj as any).content)) {
        const parts = ((obj as any).content as any[])
          .filter((c) => c && typeof c === 'object' && typeof (c as any).text === 'string')
          .map((c) => (c as any).text as string);
        if (parts.length) text = parts.join('\n');
      }
    }

    return { kind, text };
  }
}
