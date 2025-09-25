import type { RunnableConfig } from '@langchain/core/runnables';
import { SystemMessage } from '@langchain/core/messages';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';

export type MemoryPlacement = 'after_system' | 'last_message';
export type MemoryContent = 'full' | 'tree';

const DEFAULT_SIZE_CAP = 20_000;

export class MemoryConnectorNode {
  private config: { placement: MemoryPlacement; content: MemoryContent; maxChars?: number } = {
    placement: 'after_system',
    content: 'full',
  };
  private memoryService?: MemoryService;

  constructor(private logger: LoggerService) {}

  setConfig(cfg: { placement: MemoryPlacement; content: MemoryContent; maxChars?: number }): void {
    this.config = { ...this.config, ...cfg };
  }

  setMemoryService(ms: unknown): void {
    this.memoryService = ms as MemoryService;
  }

  clearMemoryService(): void {
    this.memoryService = undefined;
  }

  getConfig(): { placement: MemoryPlacement; content: MemoryContent; maxChars?: number } {
    return this.config;
  }

  private async buildTree(prefix = '/'): Promise<string> {
    if (!this.memoryService) return '';
    const dotMap = await this.memoryService.dump();
    const topLevel = new Set<string>();
    for (const key of Object.keys(dotMap)) {
      const first = key.split('.')[0];
      if (first) topLevel.add(first);
    }
    const lines: string[] = [];
    for (const name of Array.from(topLevel).sort()) {
      lines.push(`[dir] ${name}`);
    }
    return `<memory-tree>\n${lines.join('\n')}\n</memory-tree>`;
  }

  private async buildFull(): Promise<string> {
    if (!this.memoryService) return '';
    const dotMap = await this.memoryService.dump();
    return `<memory>${JSON.stringify(dotMap)}</memory>`;
  }

  async renderMessage(_config: RunnableConfig): Promise<SystemMessage | null> {
    if (!this.memoryService) return null;

    const mode = this.config.content;
    let content = '';
    if (mode === 'tree') {
      content = await this.buildTree('/');
    } else {
      content = await this.buildFull();
      const cap = this.config.maxChars ?? DEFAULT_SIZE_CAP;
      if (content.length > cap) {
        const tree = await this.buildTree('/');
        content = `Memory content truncated; showing tree only\n${tree}`;
      }
    }

    return new SystemMessage(content);
  }
}
