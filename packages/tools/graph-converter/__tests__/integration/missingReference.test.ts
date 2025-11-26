import path from 'node:path';
import { convertGraphs, type ConverterOptions } from '../../src/index.js';
import { createTempDir, noopLogger, writeJson } from '../test-helpers.js';

describe('edge reference validation', () => {
  it('fails when an edge references a missing node', async () => {
    const root = await createTempDir();

    await writeJson(path.join(root, 'graph.meta.json'), {
      name: 'main',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
      format: 2,
    });

    await writeJson(path.join(root, 'nodes', 'node-a.json'), {
      id: 'node-a',
      template: 'template-a',
    });

    await writeJson(path.join(root, 'edges', 'node-a-out__node-b-in.json'), {
      id: 'node-a-out__node-b-in',
      source: 'node-a',
      sourceHandle: 'out',
      target: 'node-b',
      targetHandle: 'in',
    });

    const options: ConverterOptions = {
      root,
      patterns: [],
      inPlace: false,
      backupExt: null,
      dryRun: false,
      outputExt: '.yaml',
      atomic: false,
      validateOnly: false,
      schemaMigrate: false,
      strict: true,
    };

    const result = await convertGraphs(options, noopLogger);
    expect(result.ioErrors).toHaveLength(0);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0]).toMatch(/missing node/i);
  });
});
