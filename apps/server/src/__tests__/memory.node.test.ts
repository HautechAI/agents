import { describe, it, expect } from 'vitest';
import { LoggerService } from '../services/logger.service';
import { MemoryNode } from '../nodes/memory.node';

describe('MemoryNode basic behavior', () => {
  it('tracks scope via setConfig and returns nodeId', () => {
    const logger = new LoggerService();
    const node = new MemoryNode(logger, 'NODE-123');
    node.setConfig({ scope: 'perThread' });
    expect(node.getScope()).toBe('perThread');
    expect(node.getNodeId()).toBe('NODE-123');
  });
});
