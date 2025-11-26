import { promises as fs } from 'node:fs';
import path from 'node:path';
import { convertGraphs, type ConverterOptions } from '../../src/index.js';
import { createTempDir, noopLogger, writeJson } from '../test-helpers.js';

describe('backup option', () => {
  it('renames original JSON files when backup extension is provided', async () => {
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

    const options: ConverterOptions = {
      root,
      patterns: [],
      inPlace: true,
      backupExt: '.bak',
      dryRun: false,
      outputExt: '.yaml',
      atomic: false,
      validateOnly: false,
      schemaMigrate: false,
      strict: true,
    };

    const result = await convertGraphs(options, noopLogger);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.ioErrors).toHaveLength(0);

    await expect(fs.stat(path.join(root, 'nodes', 'node-a.json'))).rejects.toThrow();
    await fs.stat(path.join(root, 'nodes', 'node-a.json.bak'));
  });
});
