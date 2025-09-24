import { describe, it, expect } from 'vitest';
import { LoggerService } from '../services/logger.service';
import { MemoryConnectorNode } from '../nodes/memoryConnector.node';

describe('MemoryConnectorNode', () => {
  it('persists config and returns null from renderMessage', async () => {
    const logger = new LoggerService();
    const node = new MemoryConnectorNode(logger);
    node.setConfig({ placement: 'last_message', content: 'tree' });
    expect(node.getConfig()).toEqual({ placement: 'last_message', content: 'tree' });

    node.setMemoryService({});
    node.clearMemoryService();

    const res = await node.renderMessage({} as any);
    expect(res).toBeNull();
  });
});
