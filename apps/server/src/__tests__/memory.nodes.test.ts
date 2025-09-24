import { describe, it, expect } from 'vitest';
import { SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';
import { MemoryNode } from '../nodes/memory.node';
import { MemoryConnectorNode } from '../nodes/memoryConnector.node';

const mockDb: any = {};
const logger = new LoggerService();

describe('MemoryNode', () => {
  it('returns MemoryService with global scope', () => {
    const node = new MemoryNode(mockDb, logger, 'N1');
    node.setConfig({ scope: 'global' });
    const svc = node.getService();
    // @ts-expect-error access internals for test only
    const key = svc._ensureDocKey();
    expect(key).toEqual({ nodeId: 'N1', scope: 'global' });
  });

  it('returns MemoryService with perThread scope and threadResolver', () => {
    const node = new MemoryNode(mockDb, logger, 'N1');
    node.setConfig({ scope: 'perThread' });
    const svc = node.getService('T1');
    // @ts-expect-error access internals for test only
    const key = svc._ensureDocKey();
    expect(key).toEqual({ nodeId: 'N1', scope: 'perThread', threadId: 'T1' });
  });
});

describe('MemoryConnectorNode', () => {
  it('accepts config and memory service; renderMessage returns null for now', async () => {
    const connector = new MemoryConnectorNode();
    connector.setConfig({ placement: 'after_system', content: 'full' });
    const svc = new MemoryService(mockDb as any, logger, {
      nodeId: 'N1',
      scope: 'global',
      threadResolver: () => undefined,
    });
    connector.setMemoryService(svc);
    const msg = await connector.renderMessage({} as RunnableConfig);
    expect(msg).toBeNull();
    connector.clearMemoryService();
    const msg2 = await connector.renderMessage({} as RunnableConfig);
    expect(msg2).toBeNull();
  });
});
