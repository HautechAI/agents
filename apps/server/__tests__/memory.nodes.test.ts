import { describe, it, expect } from 'vitest';
import { SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';
import { MemoryNode } from '../src/nodes/memory.node';
import { MemoryConnectorNode } from '../src/nodes/memoryConnector.node';

const mockDb: any = { collection: () => ({ createIndex: async () => {}, findOne: async () => null, updateOne: async () => ({}) }) };
const logger = new LoggerService();

describe('MemoryNode', () => {
  it('returns MemoryService with global scope', () => {
    const node = new MemoryNode(logger, 'N1');
    node.setDb(mockDb);
    node.setConfig({ scope: 'global' });
    const svc = node.getMemoryService({ configurable: {} } as any);
    // @ts-expect-error access internals for test only
    const key = svc._ensureDocKey();
    expect(key).toEqual({ nodeId: 'N1', scope: 'global' });
  });

  it('returns MemoryService with perThread scope and threadResolver', () => {
    const node = new MemoryNode(logger, 'N1');
    node.setDb(mockDb);
    node.setConfig({ scope: 'perThread' });
    const svc = node.getMemoryService({ configurable: { thread_id: 'T1' } } as any);
    // @ts-expect-error access internals for test only
    const key = svc._ensureDocKey();
    expect(key).toEqual({ nodeId: 'N1', scope: 'perThread', threadId: 'T1' });
  });
});

describe('MemoryConnectorNode', () => {
  it('accepts config and memory service; renderMessage returns null when no service; returns SystemMessage when set', async () => {
    const connector = new MemoryConnectorNode(logger);
    connector.setConfig({ placement: 'after_system', content: 'full' });

    // Without service: null
    const msgNull = await connector.renderMessage({} as RunnableConfig);
    expect(msgNull).toBeNull();

    // With service but empty DB produces a SystemMessage (maybe empty)
    const svc = new MemoryService(mockDb as any, logger, {
      nodeId: 'N1',
      scope: 'global',
      threadResolver: () => undefined,
    });
    connector.setMemoryService(svc);
    const msg = await connector.renderMessage({} as RunnableConfig);
    expect(msg).toBeInstanceOf(SystemMessage);
  });
});
