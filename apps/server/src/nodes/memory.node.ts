import type { Db } from 'mongodb';
import { LoggerService } from '../services/logger.service';
import { MemoryService, type MemoryScope } from '../services/memory.service';

export type MemoryNodeConfig = { scope: MemoryScope };

export class MemoryNode {
  private nodeId: string;
  private db?: Db;
  private logger: LoggerService;
  private config: MemoryNodeConfig = { scope: 'global' };

  constructor(logger: LoggerService, nodeId: string) {
    this.logger = logger;
    this.nodeId = nodeId;
  }

  setDb(db: Db): void {
    this.db = db;
  }

  setConfig(cfg: MemoryNodeConfig): void {
    this.config = { ...this.config, ...cfg };
  }

  getScope(): MemoryScope {
    return this.config.scope;
  }

  getNodeId(): string {
    return this.nodeId;
  }

  // Optional placeholder to be used later
  getMemoryService(config: { configurable?: { thread_id?: string } }): MemoryService {
    if (!this.db) throw new Error('Database not set');
    const scope = this.config.scope || 'global';
    const threadResolver = () => config?.configurable?.thread_id;
    return new MemoryService(this.db, this.logger, { nodeId: this.nodeId, scope, threadResolver });
  }
}
