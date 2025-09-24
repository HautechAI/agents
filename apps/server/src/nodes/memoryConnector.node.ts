import type { RunnableConfig } from '@langchain/core/runnables';
import { LoggerService } from '../services/logger.service';

export type MemoryPlacement = 'after_system' | 'last_message';
export type MemoryContent = 'full' | 'tree';

export class MemoryConnectorNode {
  private config: { placement: MemoryPlacement; content: MemoryContent } = {
    placement: 'after_system',
    content: 'full',
  };
  private memoryService?: unknown;

  constructor(private logger: LoggerService) {}

  setConfig(cfg: { placement: MemoryPlacement; content: MemoryContent }): void {
    this.config = { ...this.config, ...cfg };
  }

  setMemoryService(ms: unknown): void {
    this.memoryService = ms;
  }

  clearMemoryService(): void {
    this.memoryService = undefined;
  }

  getConfig(): { placement: MemoryPlacement; content: MemoryContent } {
    return this.config;
  }

  async renderMessage(_config: RunnableConfig): Promise<null> {
    // Placeholder for Phase 3
    return null;
  }
}
