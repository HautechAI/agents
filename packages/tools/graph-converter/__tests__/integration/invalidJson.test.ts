import { promises as fs } from 'node:fs';
import path from 'node:path';
import { convertGraphs, type ConverterOptions } from '../../src/index.js';
import { createTempDir, noopLogger, writeJson } from '../test-helpers.js';

describe('invalid JSON handling', () => {
  it('reports IO errors when files cannot be parsed', async () => {
    const root = await createTempDir();

    await writeJson(path.join(root, 'graph.meta.json'), {
      name: 'main',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
      format: 2,
    });

    const brokenPath = path.join(root, 'nodes', 'broken.json');
    await fs.mkdir(path.dirname(brokenPath), { recursive: true });
    await fs.writeFile(brokenPath, '{ invalid json', 'utf8');

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
    expect(result.ioErrors).toHaveLength(1);
    expect(result.ioErrors[0]).toMatch(/Failed to read nodes\/broken.json/);
  });
});
