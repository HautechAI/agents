import type { RunnableConfig } from '@langchain/core/runnables';
import { SystemMessage } from '@langchain/core/messages';
import { MemoryService } from '../services/memory.service';

export type MemoryConnectorConfig = {
  placement: 'after_system' | 'last_message';
  content: 'full' | 'tree';
};

export class MemoryConnectorNode {
  private config: MemoryConnectorConfig = { placement: 'after_system', content: 'full' };
  private memoryService?: MemoryService;

  setConfig(cfg: MemoryConnectorConfig): void {
    this.config = { ...this.config, ...cfg };
  }

  setMemoryService(svc: MemoryService): void {
    this.memoryService = svc;
  }

  clearMemoryService(): void {
    this.memoryService = undefined;
  }

  async renderMessage(_config: RunnableConfig): Promise<SystemMessage | null> {
    // Implemented in Phase 3
    return null;
  }
}
