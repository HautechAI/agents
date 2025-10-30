import { Injectable } from '@nestjs/common';

@Injectable()
export class BusyThreadsService {
  private active: Set<string> = new Set();
  private key(nodeId: string, threadId: string): string { return `${nodeId}::${threadId}`; }
  isActive(nodeId: string, threadId: string): boolean { return this.active.has(this.key(nodeId, threadId)); }
  tryAcquire(nodeId: string, threadId: string): boolean { const k = this.key(nodeId, threadId); if (this.active.has(k)) return false; this.active.add(k); return true; }
  release(nodeId: string, threadId: string): void { this.active.delete(this.key(nodeId, threadId)); }
}
