import { describe, it, expect, vi } from 'vitest';
import { GraphController } from '../src/graph/controllers/graph.controller';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('POST /api/graph/nodes/:id/actions', () => {
  function makeController() {
    const templateRegistry: any = { toSchema: vi.fn() };
    const runtime: any = { provisionNode: vi.fn(async () => {}), deprovisionNode: vi.fn(async () => {}) };
    const logger: any = { info: vi.fn(), error: vi.fn() };
    const nodeState: any = { upsertNodeState: vi.fn() };
    return new GraphController(templateRegistry, runtime, logger, nodeState);
  }

  it('returns 204 (null body) for provision and deprovision', async () => {
    const ctrl = makeController();
    const res1 = await ctrl.postNodeAction('n1', { action: 'provision' });
    expect(res1).toBeNull();
    const res2 = await ctrl.postNodeAction('n1', { action: 'deprovision' });
    expect(res2).toBeNull();
  });

  it('returns 400 for invalid action payload', async () => {
    const ctrl = makeController();
    try {
      await ctrl.postNodeAction('n1', { action: 'invalid' });
      // Should not reach
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const he = e as HttpException;
      expect(he.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });
});

