import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

// Central toggle for verbose memory tool logs
let DEBUG = false;
export function isMemoryDebugEnabled() { return DEBUG; }
export function setMemoryDebugEnabled(v: boolean) { DEBUG = !!v; }

// Normalize paths at runtime: ensure leading '/', collapse '//' and resolve '.' segments only
export function normalizePathRuntime(p: string): string {
  if (typeof p !== 'string' || p.length === 0) throw Object.assign(new Error('invalid path'), { code: 'EINVAL' });
  let out = p.replace(/\\/g, '/');
  // Reject directory traversal attempts
  if (out.includes('..')) throw Object.assign(new Error('invalid path'), { code: 'EINVAL' });
  // Reject illegal characters
  if (!/^[A-Za-z0-9_\-./]+$/.test(out)) throw Object.assign(new Error('invalid path'), { code: 'EINVAL' });
  if (!out.startsWith('/')) out = '/' + out;
  out = out.replace(/\/+/g, '/');
  // remove '/./'
  out = out.replace(/\/\.\//g, '/');
  return out;
}

type Factory<T> = (opts: { threadId?: string }) => T;

export abstract class MemoryToolBase {
  protected logger: LoggerService;
  private factory?: Factory<unknown>;
  constructor(logger: LoggerService) { this.logger = logger; }

  // Allow wiring a Memory service factory or MemoryNode-like object
  setMemorySource(factoryOrNode: Factory<unknown> | { getMemoryService: Factory<unknown> }) {
    if (typeof factoryOrNode === 'function') {
      this.factory = factoryOrNode as Factory<unknown>;
    } else if (factoryOrNode && typeof (factoryOrNode as any).getMemoryService === 'function') {
      this.factory = (opts: { threadId?: string }) => (factoryOrNode as any).getMemoryService(opts);
    } else {
      throw new Error('Invalid memory source');
    }
  }

  protected requireFactory(): Factory<unknown> {
    if (!this.factory) throw Object.assign(new Error('Memory service not connected'), { code: 'ENOTMEM' });
    return this.factory;
  }
}
